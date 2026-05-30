"""Ranking Engine - 纯代码打分排序，0ms"""

import math
from typing import Dict, Any, List, Optional


class RankingEngine:
    """偏好驱动的 POI 排序引擎"""

    # 硬约束检查
    HARD_CONSTRAINTS = [
        ("cannot_eat_spicy", "spicy"),
        ("need_quiet", "quiet"),
        ("need_indoor", "indoor"),
        ("need_outdoor", "outdoor"),
        ("family_friendly_required", "family_friendly"),
    ]

    # 软权重（用户偏好维度权重可扩展）
    DEFAULT_WEIGHTS = {
        "aesthetic": 1.0,
        "social": 1.0,
        "spicy": 1.0,
        "light_diet": 1.0,
        "family_friendly": 1.0,
        "romantic": 1.0,
        "active": 1.0,
        "indoor": 1.0,
        "outdoor": 1.0,
        "popular": 1.0,
        "budget_friendly": 1.0,
        "quiet": 1.0,
        "trendy": 1.0,
    }

    def __init__(self, user_preferences: Dict[str, Any], user_constraints: Dict[str, bool]):
        """
        user_preferences: {"aesthetic": 0.9, "social": 0.7, ...}
        user_constraints: {"cannot_eat_spicy": True, "need_indoor": False, ...}
        """
        self.preferences = user_preferences
        self.constraints = user_constraints
        self.weights = {**self.DEFAULT_WEIGHTS, **user_preferences.get("_weights", {})}

    def check_hard_constraints(self, poi_tags: Dict[str, float]) -> bool:
        """检查硬约束，返回 False 表示该 POI 被过滤"""
        for constraint_key, tag_key in self.HARD_CONSTRAINTS:
            if self.constraints.get(constraint_key, False):
                tag_val = poi_tags.get(tag_key, 0.0)
                # indoor/outdoor 是互斥标签：需要室内则拒绝室外POI，需要室外则拒绝室内POI
                if tag_key in ("indoor", "outdoor"):
                    if tag_key == "indoor" and tag_val < 0.5:
                        return False  # 需要室内，但POI是室外的
                    if tag_key == "outdoor" and tag_val < 0.5:
                        return False  # 需要室外，但POI是室内的
                else:
                    if tag_val >= 0.5:
                        return False
        return True

    def score_poi(self, poi_tags: Dict[str, float]) -> float:
        """计算单个 POI 综合得分"""
        score = 0.0

        for tag, weight in self.weights.items():
            if tag.startswith("_"):
                continue
            poi_score = poi_tags.get(tag, 0.0)
            user_pref = self.preferences.get(tag, 0.5)
            # 偏好匹配 * 权重
            score += poi_score * user_pref * weight

        # 距离惩罚（如果提供了 distance_km）
        distance = self.preferences.get("_distance_km")
        if distance and distance > 1.0:
            penalty = min(distance * 0.1, 2.0)
            score -= penalty

        return round(score, 3)

    def rank(self, poi_list: List[Dict[str, Any]], poi_tags: Dict[str, Dict[str, float]]) -> List[Dict[str, Any]]:
        """
        排序主函数。
        输入: [{"name": "teamLab", "location": "..."}, ...], {"teamLab": {"aesthetic": 1.0, ...}}
        输出: 排序后的 POI 列表（添加了 _score 字段）
        """
        scored = []
        for poi in poi_list:
            name = poi.get("name", "")
            tags = poi_tags.get(name, {})
            if not self.check_hard_constraints(tags):
                continue
            score = self.score_poi(tags)
            scored.append({**poi, "_score": score, "_tags": tags})

        # 按分数降序
        scored.sort(key=lambda x: x["_score"], reverse=True)
        return scored


def rank_pois(
    poi_list: List[Dict[str, Any]],
    poi_tags: Dict[str, Dict[str, float]],
    user_preferences: Dict[str, Any],
    user_constraints: Dict[str, bool]
) -> List[Dict[str, Any]]:
    """便捷函数"""
    engine = RankingEngine(user_preferences, user_constraints)
    return engine.rank(poi_list, poi_tags)