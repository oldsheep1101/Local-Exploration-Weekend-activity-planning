"""周末闲时规划 Agent"""

import uuid
from typing import Dict, Any
from ..services.llm_service import get_llm
from ..models.schemas import PlanRequest, WeekendPlan, ScenarioContext, PlanStep

class PlannerAgent:
    def __init__(self):
        self.llm = get_llm()

    def parse_scenario(self, query: str, city: str) -> ScenarioContext:
        """解析场景"""
        try:
            result = self.llm.parse_query(query, city)
            # 处理新旧字段名的兼容
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

    def generate_plan(self, request: PlanRequest) -> WeekendPlan:
        """生成规划方案"""
        # 解析场景
        scenario = self.parse_scenario(request.query, request.city)
        plan_id = str(uuid.uuid4())[:8]

        # 构建规划 prompt - 合并场景解析和规划生成
        prompt = f"""用户需求：{request.query}
城市：{request.city}
场景类型：{scenario.scenario_type}
约束条件：{', '.join(scenario.constraints) if scenario.constraints else '无'}
时长：{scenario.duration_hours}小时

请生成一个下午{scenario.duration_hours}小时的规划方案，返回有效JSON：
{{
  "summary": "一句话方案描述",
  "steps": [
    {{"step_id": "1", "type": "activity", "title": "活动名称", "description": "描述", "time_range": "14:00-15:30", "duration_minutes": 90, "location": "地点"}},
    {{"step_id": "2", "type": "food", "title": "餐厅名称", "description": "描述", "time_range": "15:30-17:00", "duration_minutes": 90, "location": "地点"}}
  ],
  "total_duration_hours": {scenario.duration_hours},
  "suggestions": ["建议1", "建议2"]
}}"""

        try:
            result = self.llm.generate_plan(prompt)
            print(f"LLM 返回结果: {result}")

            if "raw" in result:
                # fallback
                result = {
                    "summary": "周末亲子活动方案",
                    "steps": [
                        {"step_id": "1", "type": "activity", "title": "亲子乐园", "description": "带孩子去玩", "time_range": "14:00-16:00", "duration_minutes": 120, "location": "室内乐园"},
                        {"step_id": "2", "type": "food", "title": "健康餐厅", "description": "老婆减肥，吃低卡餐", "time_range": "16:00-17:30", "duration_minutes": 90, "location": "餐厅"}
                    ],
                    "total_duration_hours": 4.0,
                    "suggestions": ["带好水杯", "注意孩子安全"]
                }

            # 确保 steps 有 step_id
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
        except Exception as e:
            print(f"生成规划失败: {e}")
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

_agent = None
def get_agent() -> PlannerAgent:
    global _agent
    if _agent is None:
        _agent = PlannerAgent()
    return _agent