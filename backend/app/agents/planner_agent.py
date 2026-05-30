"""轻量 Planner - 多通道召回 + LLM slot 顺序决策"""

import uuid
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from ..models.schemas import ScenarioContext, PlanStep, WeekendPlan
from ..services.poi_service import search_multi_pool, POIInfo
from ..services.tagging_service import get_tagging
from ..services.llm_service import get_llm
from ..agents.ranking_engine import rank_pois
from ..agents.area_grouping import cluster_itinerary_pois


class LightPlanner:
    """轻量规划器：Tagging → Ranking → 纯代码拼时间轴"""

    # 不同类型活动的建议时长（分钟）
    DEFAULT_DURATIONS = {
        "exhibition": 90,
        "restaurant": 75,
        "outdoor": 60,
        "ktv": 120,
        "mall": 90,
        "cafe": 60,
        "bar": 90,
        "sports": 60,
        "default": 60
    }

    # 活动类型到标签维度的映射
    TYPE_TAG_MAP = {
        "展览": "indoor",
        "博物馆": "indoor",
        "美术馆": "aesthetic",
        "餐厅": "social",
        "美食": "social",
        "公园": "outdoor",
        "户外": "outdoor",
        "游乐场": "family_friendly",
        "KTV": "social",
        "剧本杀": "social",
        "密室逃脱": "social",
        "咖啡厅": "quiet",
        "书店": "quiet",
        "健身房": "active",
        "运动": "active",
    }

    def __init__(self):
        self.tagging = get_tagging()
        self.llm = get_llm()

    def _get_duration(self, poi: POIInfo) -> int:
        """根据 POI 类型决定建议时长"""
        poi_type = poi.type.lower()
        for key, val in self.TYPE_TAG_MAP.items():
            if key in poi_type:
                return self.DEFAULT_DURATIONS.get(val, 60)
        return self.DEFAULT_DURATIONS["default"]

    def _build_steps(
        self,
        ranked_pois: List[Dict[str, Any]],
        start_minutes: int,
        scenario: ScenarioContext
    ) -> List[PlanStep]:
        """把排序后的 POI 拼成时间轴"""
        steps = []
        current_minutes = start_minutes
        step_id = 1

        # 最多取 5 个活动
        for poi in ranked_pois[:5]:
            name = poi.get("name", "")
            duration = poi.get("_duration", self.DEFAULT_DURATIONS["default"])
            end_minutes = current_minutes + duration

            steps.append(PlanStep(
                step_id=str(step_id),
                type="activity" if "餐厅" not in name and "美食" not in name else "food",
                title=name,
                description=f"安排游玩，约{duration}分钟",
                time_range=f"{self._fmt_time(current_minutes)}-{self._fmt_time(end_minutes)}",
                duration_minutes=duration,
                location=poi.get("address") or name,
                booking_status="pending",
                booking_info=None,
                risk_note=None
            ))

            current_minutes = end_minutes

            # 如果是餐厅类型，后面加一个用餐时段
            if "餐厅" in name or "美食" in name:
                # 假设用餐 60 分钟
                eat_end = current_minutes + 60
                steps.append(PlanStep(
                    step_id=f"{step_id}a",
                    type="food",
                    title=f"{name}用餐",
                    description="用餐休息",
                    time_range=f"{self._fmt_time(current_minutes)}-{self._fmt_time(eat_end)}",
                    duration_minutes=60,
                    location=name,
                    booking_status="pending",
                    booking_info=None,
                    risk_note=None
                ))
                current_minutes = eat_end

            step_id += 1

        return steps

    def _fmt_time(self, total_minutes: int) -> str:
        """分钟转 HH:MM 字符串"""
        hours = (total_minutes // 60) % 24
        mins = total_minutes % 60
        return f"{hours:02d}:{mins:02d}"

    def _build_itinerary(
        self,
        ranked_pois: List[Dict[str, Any]],
        scenario: ScenarioContext
    ) -> WeekendPlan:
        """生成完整 itinerary"""
        # 解析出发时间
        dep_time = scenario.departure_time or "14:00"
        try:
            h, m = map(int, dep_time.split(":"))
            start_minutes = h * 60 + m
        except:
            start_minutes = 14 * 60

        steps = self._build_steps(ranked_pois, start_minutes, scenario)

        total_mins = sum(s.duration_minutes for s in steps)
        total_hours = round(total_mins / 60, 1)

        plan_id = str(uuid.uuid4())[:8]

        return WeekendPlan(
            plan_id=plan_id,
            summary=f"{scenario.scenario_type}周末方案（{len(steps)}个活动）",
            scenario=scenario,
            steps=steps,
            total_duration_hours=total_hours,
            suggestions=["建议提前预约", "注意天气变化"]
        )

    def _build_steps(
        self,
        ranked_pois: List[Dict[str, Any]],
        start_minutes: int,
        scenario: ScenarioContext
    ) -> List[PlanStep]:
        """保留旧方法供 fallback 使用"""
        steps = []
        current_minutes = start_minutes
        step_id = 1

        for poi in ranked_pois[:5]:
            name = poi.get("name", "")
            duration = poi.get("_duration", self.DEFAULT_DURATIONS["default"])
            end_minutes = current_minutes + duration

            steps.append(PlanStep(
                step_id=str(step_id),
                type="activity",
                title=name,
                description=f"安排游玩，约{duration}分钟",
                time_range=f"{self._fmt_time(current_minutes)}-{self._fmt_time(end_minutes)}",
                duration_minutes=duration,
                location=poi.get("address") or name,
                booking_status="pending",
                booking_info=None,
                risk_note=None
            ))
            current_minutes = end_minutes
            step_id += 1

        return steps

    def _decide_slots(self, dep_minutes: int, ranked_pools: Dict[str, List], constraints: List[str]):
        """让 LLM 决定 slot 顺序：哪个时间放哪个 pool 的第几个 POI"""
        # 构建候选摘要
        pool_summary = {}
        for pool, pois in ranked_pools.items():
            pool_summary[pool] = [f"{p['name']} ({p.get('_duration', 60)}min)" for p in pois[:3]]

        dep_h = dep_minutes // 60
        dep_m = dep_minutes % 60

        messages = [
            {"role": "system", "content": f"""你是一个行程规划助手。根据出发时间和候选 POI，决定 slot 顺序。

## 规则
1. 必须包含 meal slots（午餐、晚餐），如果 food pool 有候选必须安排
2. 每个 activity 约 60-90 分钟，每个 meal 约 60 分钟
3. 总时长约 4-6 小时
4. 出发时间 {dep_h:02d}:{dep_m:02d}

## 严格返回 JSON（不要任何其他文字）：
{{"slots": [
  {{"order": 1, "pool": "activity", "poi_index": 0, "duration_min": 90}},
  {{"order": 2, "pool": "food", "poi_index": 0, "duration_min": 60}},
  ...
]}}

## 候选 POI 格式
{{"pool名": ["POI名 (时长min)", ...]}}

## 约束条件
{', '.join(constraints) if constraints else '无'}"""},
            {"role": "user", "content": "出发时间: %02d:%02d\n候选POI:\n%s\n\n请返回JSON。" % (dep_h, dep_m, "\n".join("- %s: %s" % (p, ", ".join(items)) for p, items in pool_summary.items()))}
        ]

        try:
            response = self.llm.chat(messages, temperature=0.3, max_tokens=1500)
            content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            result = json.loads(content.strip())
            return result.get("slots", [])
        except Exception as e:
            print(f"[Slot决策] LLM失败: {e}")
            return self._fallback_slots(dep_minutes, ranked_pools)

    def _fallback_slots(self, dep_minutes: int, ranked_pools: Dict[str, List]) -> List[Dict]:
        """简单 fallback：当 LLM 失败时用"""
        slots = []
        current = dep_minutes
        order = [("activity", 0, 90), ("food", 0, 60), ("activity", 1, 60), ("food", 1, 60)]
        for pool, idx, dur in order:
            pois = ranked_pools.get(pool, [])
            if idx < len(pois):
                slots.append({"pool": pool, "poi_index": idx, "duration_min": dur})
                current += dur + 15
        return slots

    def _fmt_time(self, total_minutes: int) -> str:
        hours = (total_minutes // 60) % 24
        mins = total_minutes % 60
        return f"{hours:02d}:{mins:02d}"

    def _build_steps_from_slots(
        self,
        slots: List[Dict],
        ranked_pools: Dict[str, List],
        start_minutes: int
    ) -> List[PlanStep]:
        """把 slot 列表拼成带时间轴的 PlanStep"""
        steps = []
        step_id = 1
        current = start_minutes

        for slot in slots:
            pool = slot.get("pool", "activity")
            idx = slot.get("poi_index", 0)
            dur = slot.get("duration_min", 60)
            pois = ranked_pools.get(pool, [])
            poi = pois[idx] if idx < len(pois) else pois[0] if pois else {"name": "待定", "address": ""}
            end = current + dur

            step_type = "food" if pool == "food" else ("activity" if pool == "activity" else "extra")

            steps.append(PlanStep(
                step_id=str(step_id),
                type=step_type,
                title=poi.get("name", "未知地点"),
                description=f"安排约{dur}分钟",
                time_range=f"{self._fmt_time(current)}-{self._fmt_time(end)}",
                duration_minutes=dur,
                location=poi.get("address") or poi.get("name", ""),
                booking_status="pending",
                booking_info=None,
                risk_note=None
            ))

            current = end + 15  # 15min 通勤 buffer
            step_id += 1

        return steps

    def _feasibility_loop(
        self,
        ranked_pools: Dict[str, List],
        dep_minutes: int,
        constraints: List[str],
        constraints_dict: Dict[str, bool]
    ) -> Dict[str, List]:
        """
        Feasibility Loop：Area Grouping → 检查候选数 → 放宽约束重试
        Level 1: 同区+相邻，30min通勤
        Level 2: 45min通勤
        Level 3: 取消optional pool限制
        Level 4: 只保 activity + food
        """
        from ..agents.area_grouping import cluster_itinerary_pois

        level = 1
        max_transit = 30
        allow_optional = True

        while level <= 4:
            activity_filtered, food_filtered, optional_filtered = cluster_itinerary_pois(
                ranked_pools.get("activity", []),
                ranked_pools.get("food", []),
                ranked_pools.get("optional", []),
                max_transit_minutes=max_transit
            )

            # 核心检查：activity 和 food 必须有候选
            if not activity_filtered or not food_filtered:
                level += 1
                if level == 2:
                    max_transit = 45
                elif level == 3:
                    allow_optional = False
                elif level == 4:
                    activity_filtered = ranked_pools.get("activity", [])[:5]
                    food_filtered = ranked_pools.get("food", [])[:5]
                    optional_filtered = []
                continue

            # Level 1-2: optional 可以没有
            if not optional_filtered and level == 1:
                level += 1
                max_transit = 45
                continue

            print(f"[FeasibilityLoop] Level {level} 通过: activity={len(activity_filtered)}, food={len(food_filtered)}, optional={len(optional_filtered)}")
            return {
                "activity": activity_filtered,
                "food": food_filtered,
                "optional": optional_filtered if allow_optional else []
            }

        # 最终 fallback：直接用 ranking 结果，不做 area 过滤
        print("[FeasibilityLoop] 全部放宽失败，使用原始 ranked 结果")
        return ranked_pools

    def plan(self, scenario: ScenarioContext, user_preferences: Dict[str, Any], user_constraints: Dict[str, bool]) -> WeekendPlan:
        """
        主入口：多通道召回 → Pool内 Tagging → Pool内 Ranking → LLM slot 顺序 → 纯代码时间轴
        """
        # 1. 多通道召回：activity / food / optional 独立搜索
        raw_pools = search_multi_pool(scenario, city="上海")

        # 2. 转换为 dict 并标记 pool 来源
        pool_pois = {}
        for pool_name in ["activity", "food", "optional"]:
            pois = raw_pools.get(pool_name, [])
            pool_pois[pool_name] = [
                {
                    "name": p.name, "address": p.address, "location": p.location,
                    "type": p.type, "_pool": pool_name, "_duration": self._get_duration(p)
                }
                for p in pois
            ]

        all_pois = []
        for pois in pool_pois.values():
            all_pois.extend(pois)

        if not all_pois:
            return WeekendPlan(
                plan_id=str(uuid.uuid4())[:8],
                summary="未能找到合适的地点",
                scenario=scenario, steps=[],
                total_duration_hours=0, suggestions=["请尝试其他关键词"]
            )

        # 3. 一次 LLM 给所有 POI 打标签
        poi_tags = self.tagging.tag_pois(all_pois)

        # 4. 每个 pool 单独 Ranking（只用相关 tag）
        constraints_dict = {k: v for k, v in user_constraints.items()}
        ranked_pools = {}
        for pool_name, pois in pool_pois.items():
            if not pois:
                ranked_pools[pool_name] = []
                continue
            ranked = rank_pois(pois, poi_tags, user_preferences, constraints_dict)
            ranked_pools[pool_name] = ranked

        # 4.5 Area Grouping + Feasibility Loop：按区域聚类，约束放宽重试
        dep_time = scenario.departure_time or "14:00"
        try:
            h, m = map(int, dep_time.split(":"))
            dep_minutes = h * 60 + m
        except:
            dep_minutes = 14 * 60

        ranked_pools = self._feasibility_loop(
            ranked_pools, dep_minutes, scenario.constraints, constraints_dict
        )

        # 5. LLM 决定 slot 顺序
        slots = self._decide_slots(dep_minutes, ranked_pools, scenario.constraints)

        # 6. 纯代码拼时间轴 steps
        steps = self._build_steps_from_slots(slots, ranked_pools, dep_minutes)

        total_mins = sum(s.duration_minutes for s in steps)
        total_hours = round(total_mins / 60, 1)

        return WeekendPlan(
            plan_id=str(uuid.uuid4())[:8],
            summary=f"{scenario.scenario_type}方案（{len(steps)}个步骤）",
            scenario=scenario, steps=steps,
            total_duration_hours=total_hours,
            suggestions=["建议提前预约", "注意天气变化"]
        )


# ============ MultiPersonPlanner ============

class MultiPersonPlanner(LightPlanner):
    def aggregate_preferences(self, preferences_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        if len(preferences_list) <= 1:
            return preferences_list[0] if preferences_list else {}
        aggregated = {}
        all_tags = set()
        for prefs in preferences_list:
            all_tags.update(prefs.keys())
        for tag in all_tags:
            if tag.startswith("_"):
                continue
            values = [p.get(tag, 0.5) for p in preferences_list]
            aggregated[tag] = round(sum(values) / len(values), 3)
        aggregated["_is_multi"] = True
        return aggregated

    def plan_multi(
        self, scenario: ScenarioContext,
        preferences_list: List[Dict[str, Any]],
        constraints_list: List[Dict[str, bool]]
    ) -> WeekendPlan:
        merged_constraints = {}
        for constraints in constraints_list:
            for k, v in constraints.items():
                if v:
                    merged_constraints[k] = True
        aggregated_prefs = self.aggregate_preferences(preferences_list)
        return self.plan(scenario, aggregated_prefs, merged_constraints)


_agent = None


def get_agent() -> MultiPersonPlanner:
    global _agent
    if _agent is None:
        _agent = MultiPersonPlanner()
    return _agent


_agent = None


def get_agent() -> MultiPersonPlanner:
    global _agent
    if _agent is None:
        _agent = MultiPersonPlanner()
    return _agent