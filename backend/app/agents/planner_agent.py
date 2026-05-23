"""周末闲时规划 Agent"""

import uuid
from typing import Dict, Any, Optional, Tuple
from ..services.llm_service import get_llm
from ..services.poi_service import search_pois_for_scenario, format_pois_for_prompt
from ..models.schemas import PlanRequest, WeekendPlan, ScenarioContext, PlanStep

# 天气条件分类
WEATHER_CONDITIONS = {
    'extreme_indoor_only': ['中雨', '大雨', '暴雨', '雷暴', '台风', '沙尘暴', '大雪', '暴雪'],
    'rainy_outdoor_risky': ['小雨', '阵雨', '毛毛雨', '雷阵雨', '阴'],
    'hot_indoor_preferred': [],  # 由 tempMax >= 35 判断
    'haze_indoor_preferred': ['雾', '霾', '沙尘'],
    'wind_indoor_preferred': [],  # 由风速判断
}


class PlannerAgent:
    def __init__(self):
        self.llm = get_llm()

    def parse_scenario(self, query: str, city: str) -> ScenarioContext:
        """解析场景"""
        try:
            result = self.llm.parse_query(query, city)
            party_size = result.get("party_size") or result.get("people") or 3
            return ScenarioContext(
                date=result.get("date", ""),
                departure_time=result.get("departure_time", ""),
                scenario_type=result.get("scenario", result.get("scenario_type", "family")),
                constraints=result.get("constraints", []),
                participants=[str(party_size)],
                duration_hours=4.0,
                budget=result.get("budget_per_person") or result.get("budget") or ""
            )
        except:
            return ScenarioContext(scenario_type="family", constraints=[], participants=["3"], duration_hours=4.0)

    def classify_weather_condition(self, weather: Dict[str, Any]) -> str:
        """天气条件分类：extreme_indoor_only / rainy_outdoor_risky / hot_indoor_preferred / haze_indoor_preferred / normal_outdoor_primary"""
        if not weather:
            return 'normal_outdoor_primary'

        text = weather.get('text', '')
        temp_max = weather.get('tempMax', 0)
        wind_scale = weather.get('windScale', '')

        # 极端天气 - 只出室内版
        for kw in WEATHER_CONDITIONS['extreme_indoor_only']:
            if kw in text:
                return 'extreme_indoor_only'

        # 高温
        if temp_max >= 35:
            return 'hot_indoor_preferred'

        # 雾霾
        for kw in WEATHER_CONDITIONS['haze_indoor_preferred']:
            if kw in text:
                return 'haze_indoor_preferred'

        # 大风（风级 >= 6级）
        wind_num = ''
        for c in wind_scale:
            if c.isdigit():
                wind_num += c
        if wind_num and int(wind_num) >= 6:
            return 'wind_indoor_preferred'

        # 小雨/阵雨
        for kw in WEATHER_CONDITIONS['rainy_outdoor_risky']:
            if kw in text:
                return 'rainy_outdoor_risky'

        return 'normal_outdoor_primary'

    def _get_weather_alert(self, condition: str, weather: Dict[str, Any]) -> Optional[str]:
        """根据天气条件生成提示"""
        text = weather.get('text', '') if weather else ''
        temp_max = weather.get('tempMax', 0) if weather else 0

        alerts = {
            'extreme_indoor_only': f"因【{text}】天气，暂不提供室外方案，已自动切换为室内方案",
            'rainy_outdoor_risky': "今日有雨，室外活动建议带伞，注意安全",
            'hot_indoor_preferred': f"今日气温较高（最高{temp_max}°C），建议避开暴晒户外活动",
            'haze_indoor_preferred': "今日有雾霾，建议选择室内活动",
            'wind_indoor_preferred': "今日风力较大，建议选择室内活动",
        }
        return alerts.get(condition)

    def _build_base_prompt(self, request: PlanRequest, scenario: ScenarioContext, plan_type: str, poi_context: str = "") -> str:
        """构建基础 prompt"""
        weather = request.weather or {}
        weather_info = f"\n目标日期天气：{weather.get('text', '未知')}，气温{weather.get('tempMin', 0)}~{weather.get('tempMax', 0)}°C，降水概率{weather.get('precip', 0)}%"

        prompt = f"""用户需求：{request.query}
城市：{request.city}
出发时间：{scenario.departure_time or '14:00'}
场景类型：{scenario.scenario_type}
约束条件：{', '.join(scenario.constraints) if scenario.constraints else '无'}
时长：{scenario.duration_hours}小时{weather_info}
{poi_context}

请从{scenario.departure_time or '14:00'}开始规划，生成一个{'室内' if plan_type == 'indoor' else '室外'}版规划方案，{'室内版要求：所有活动必须在室内场所，包括餐厅、商场、博物馆、游乐场等，禁止任何户外活动' if plan_type == 'indoor' else '室外版要求：以户外活动为主，如公园、景区、户外游乐等，可以有少量室内用餐休息'}

返回有效JSON：
{{
  "summary": "一句话方案描述",
  "steps": [
    {{"step_id": "1", "type": "activity", "title": "活动名称", "description": "描述", "time_range": "14:00-15:30", "duration_minutes": 90, "location": "地点"{', "risk_note": "风险提示"' if plan_type == 'outdoor' else ''}}},
    {{"step_id": "2", "type": "food", "title": "餐厅名称", "description": "描述", "time_range": "15:30-17:00", "duration_minutes": 90, "location": "地点"}}
  ],
  "total_duration_hours": {scenario.duration_hours},
  "suggestions": ["建议1", "建议2"]
}}"""
        return prompt

    def _create_plan_from_result(self, result: Dict[str, Any], plan_id: str, scenario: ScenarioContext, plan_type: str = 'indoor') -> WeekendPlan:
        """从 LLM 返回结果创建 WeekendPlan"""
        if "raw" in result:
            result = {
                "summary": "周末活动方案",
                "steps": [
                    {"step_id": "1", "type": "activity", "title": "室内乐园", "description": "带孩子去玩", "time_range": "14:00-16:00", "duration_minutes": 120, "location": "室内游乐场"},
                    {"step_id": "2", "type": "food", "title": "亲子餐厅", "description": "用餐", "time_range": "16:00-17:30", "duration_minutes": 90, "location": "餐厅"}
                ],
                "total_duration_hours": 4.0,
                "suggestions": ["注意安全", "带好水杯"]
            }

        steps_data = result.get("steps", [])
        for i, s in enumerate(steps_data):
            if "step_id" not in s:
                s["step_id"] = str(i + 1)

        steps = [PlanStep(**s) for s in steps_data]
        return WeekendPlan(
            plan_id=plan_id,
            summary=result.get("summary", "规划方案"),
            scenario=scenario,
            steps=steps,
            total_duration_hours=result.get("total_duration_hours", 4.0),
            suggestions=result.get("suggestions", [])
        )

    def _generate_single_plan(self, request: PlanRequest, scenario: ScenarioContext, plan_type: str) -> WeekendPlan:
        """生成单个方案（室内或室外）"""
        # 先搜索真实 POI
        poi_results = search_pois_for_scenario(scenario, city=request.city)
        poi_context = format_pois_for_prompt(poi_results)
        print(f"[POI搜索] 获取到 {len(poi_results)} 组 POI 结果")

        prompt = self._build_base_prompt(request, scenario, plan_type, poi_context)
        plan_id = str(uuid.uuid4())[:8]

        try:
            result = self.llm.generate_plan(prompt)
            print(f"[{plan_type.upper()}] LLM 返回: {result}")
            return self._create_plan_from_result(result, plan_id, scenario, plan_type)
        except Exception as e:
            print(f"生成{plan_type}方案失败: {e}")
            import traceback
            traceback.print_exc()
            return WeekendPlan(
                plan_id=plan_id,
                summary="周末活动方案",
                scenario=scenario,
                steps=[],
                total_duration_hours=4.0,
                suggestions=[]
            )

    def generate_dual_plan(self, request: PlanRequest) -> Dict[str, Any]:
        """生成双方案（室内版 + 室外版）"""
        scenario = self.parse_scenario(request.query, request.city)
        condition = self.classify_weather_condition(request.weather)

        indoor = self._generate_single_plan(request, scenario, 'indoor')

        # 根据天气条件决定是否生成室外版
        if condition == 'extreme_indoor_only':
            return {
                'success': True,
                'message': '已生成室内方案',
                'indoor': indoor,
                'outdoor': None,
                'weather_alert': self._get_weather_alert(condition, request.weather)
            }

        outdoor = self._generate_single_plan(request, scenario, 'outdoor')

        return {
            'success': True,
            'message': '已生成双方案',
            'indoor': indoor,
            'outdoor': outdoor,
            'weather_alert': self._get_weather_alert(condition, request.weather)
        }

    # 兼容旧方法
    def generate_plan(self, request: PlanRequest) -> WeekendPlan:
        """生成规划方案（兼容旧接口）"""
        result = self.generate_dual_plan(request)
        return result.get('indoor') or result.get('outdoor')


_agent = None
def get_agent() -> PlannerAgent:
    global _agent
    if _agent is None:
        _agent = PlannerAgent()
    return _agent