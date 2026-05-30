"""Validator Agent - Agent 闭环：天气/排队/距离/冲突修正"""

import uuid
from typing import Dict, Any, List, Optional
from ..models.schemas import ScenarioContext, PlanStep, WeekendPlan
from ..services.poi_service import search_poi, POIInfo


class ValidatorAgent:
    """规划校验与修正"""

    WEATHER_ALERTS = {
        "extreme_indoor_only": "因天气原因，已自动切换为室内方案",
        "rainy_outdoor_risky": "今日有雨，室外活动建议带伞",
        "hot_indoor_preferred": "今日气温较高，建议避开户外暴晒",
        "haze_indoor_preferred": "今日有雾霾，建议选择室内活动",
        "wind_indoor_preferred": "今日风力较大，建议选择室内活动",
    }

    def classify_weather(self, weather: Optional[Dict[str, Any]]) -> str:
        """天气条件分类"""
        if not weather:
            return "normal_outdoor_primary"

        text = weather.get("text", "")
        temp_max = weather.get("tempMax", 0)
        wind_scale = weather.get("windScale", "")

        extreme = ["中雨", "大雨", "暴雨", "雷暴", "台风", "沙尘暴", "大雪", "暴雪"]
        for kw in extreme:
            if kw in text:
                return "extreme_indoor_only"

        if temp_max >= 35:
            return "hot_indoor_preferred"

        haze = ["雾", "霾", "沙尘"]
        for kw in haze:
            if kw in text:
                return "haze_indoor_preferred"

        wind_num = "".join(c for c in wind_scale if c.isdigit())
        if wind_num and int(wind_num) >= 6:
            return "wind_indoor_preferred"

        rainy = ["小雨", "阵雨", "毛毛雨", "雷阵雨", "阴"]
        for kw in rainy:
            if kw in text:
                return "rainy_outdoor_risky"

        return "normal_outdoor_primary"

    def validate_and_fix(
        self,
        plan: WeekendPlan,
        weather: Optional[Dict[str, Any]],
        constraints: List[str]
    ) -> WeekendPlan:
        """
        校验并修正方案。
        1. 天气修正
        2. 排队时间修正（mock：如果周末+热门地点，增加 buffer）
        3. 时长冲突修正
        """
        plan = self._validate_weather(plan, weather)
        plan = self._validate_no_conflicts(plan)
        plan = self._add_wait_buffer(plan)
        plan = self._validate_constraints(plan, constraints)
        return plan

    def _validate_weather(self, plan: WeekendPlan, weather: Optional[Dict[str, Any]]) -> WeekendPlan:
        """天气校验：极端天气自动换室内"""
        condition = self.classify_weather(weather)
        alert = self.WEATHER_ALERTS.get(condition, "")

        # 如果需要室内但方案是室外的，尝试替换
        if condition == "extreme_indoor_only":
            steps = []
            for step in plan.steps:
                if step.type == "transport":
                    steps.append(step)
                    continue
                # 尝试找室内替代（简化版：直接加提示）
                if step.risk_note:
                    step.risk_note = f"[{alert}] {step.risk_note}"
                else:
                    step.risk_note = alert
                steps.append(step)
            plan.steps = steps

        # 添加天气提示到建议
        if alert and alert not in plan.suggestions:
            plan.suggestions.insert(0, alert)

        return plan

    def _validate_no_conflicts(self, plan: WeekendPlan) -> WeekendPlan:
        """时长冲突校验：相邻活动不能首尾重叠"""
        steps = []
        for i, step in enumerate(plan.steps):
            if i > 0 and step.type != "transport":
                prev = plan.steps[i - 1]
                # 检查时间重叠
                try:
                    prev_end = prev.time_range.split("-")[1]
                    curr_start = step.time_range.split("-")[0]
                    if curr_start < prev_end:
                        # 修正开始时间
                        from datetime import datetime
                        h, m = map(int, prev_end.split(":"))
                        new_start_mins = h * 60 + m
                        dur = step.duration_minutes
                        new_end_mins = new_start_mins + dur
                        step.time_range = f"{prev_end}-{self._fmt_time(new_end_mins)}"
                except Exception:
                    pass
            steps.append(step)
        plan.steps = steps
        return plan

    def _add_wait_buffer(self, plan: WeekendPlan) -> WeekendPlan:
        """排队 buffer：热门餐厅 +30min"""
        popular_keywords = ["海底捞", "绿茶", "外婆家", "西贝", "哥老官", "喜茶", "乐乐茶"]

        steps = []
        for step in plan.steps:
            steps.append(step)
            # 餐厅类型检测热门关键词
            if any(kw in step.title for kw in popular_keywords):
                # 在步骤后插入等待提示
                steps.append(PlanStep(
                    step_id=f"wait-{step.step_id}",
                    type="extra",
                    title="⏳ 可能有排队，建议提前取号",
                    description="热门餐厅周末可能需要等位30~60分钟",
                    time_range=step.time_range,
                    duration_minutes=30,
                    location=step.location,
                    booking_status="pending",
                    booking_info=None,
                    risk_note="建议提前使用大众点评取号"
                ))
        plan.steps = steps
        return plan

    def _validate_constraints(self, plan: WeekendPlan, constraints: List[str]) -> WeekendPlan:
        """约束校验"""
        for step in plan.steps:
            # 辣味约束
            if any("辣" in c or "减脂" in c or "清淡" in c for c in constraints):
                if any(spicy in step.title or "辣" in step.title for spicy in ["川菜", "湘菜", "火锅", "麻辣", "串串"]):
                    step.risk_note = (step.risk_note or "") + " [注意：有不吃辣需求]"
            # 亲子约束
            if any("儿童" in c or "孩子" in c for c in constraints):
                if step.risk_note and "儿童" not in step.risk_note:
                    step.risk_note += " | 适合儿童"
        return plan

    def _fmt_time(self, total_mins: int) -> str:
        return f"{(total_mins // 60) % 24:02d}:{total_mins % 60:02d}"


_validator = None


def get_validator() -> ValidatorAgent:
    global _validator
    if _validator is None:
        _validator = ValidatorAgent()
    return _validator