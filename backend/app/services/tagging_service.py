"""POI Tagging 服务 - 一次 LLM 批量打标签"""

import json
from typing import Dict, Any, List
from ..services.llm_service import get_llm


class TaggingService:
    """给 POI 打语义标签，LLM 只调用一次"""

    # 标签维度定义
    TAG_DIMENSIONS = [
        "aesthetic",       # 美学/艺术感
        "social",          # 社交属性
        "spicy",           # 辛辣/重口味
        "light_diet",      # 轻食/健康
        "family_friendly", # 亲子友好
        "romantic",        # 浪漫约会
        "active",         # 活跃/运动
        "indoor",          # 室内
        "outdoor",        # 户外
        "popular",         # 人气热门
        "budget_friendly", # 性价比
        "quiet",           # 安静
        "trendy",          # 网红/新潮
    ]

    def tag_pois(self, pois: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
        """
        一次性给所有 POI 打标签。
        输入: [{"name": "teamLab", "type": "展览", "address": "..."}, ...]
        输出: {"teamLab": {"aesthetic": 1.0, "social": 0.3, ...}, ...}
        """
        if not pois:
            return {}

        # 构建 POI 描述片段
        poi_lines = []
        for i, p in enumerate(pois, 1):
            poi_lines.append(f'{i}. {p.get("name","")} | 类型:{p.get("type","")} | 地址:{p.get("address","")}')

        poi_text = "\n".join(poi_lines)

        messages = [
            {"role": "system", "content": f"""你是一个 POI 语义标签专家。请为每个地点打标签。

## 标签维度（每个维度 0.0~1.0）：
- aesthetic: 美学/艺术感（艺术展、美术馆、设计展得分高）
- social: 社交属性（剧本杀、KTV、聚餐、酒吧得分高）
- spicy: 辛辣/重口味（川菜、湘菜、火锅得分高）
- light_diet: 轻食/健康（沙拉、轻食、减脂餐、日料得分高）
- family_friendly: 亲子友好（游乐场、海洋馆、亲子餐厅得分高）
- romantic: 浪漫约会（西餐、景观餐厅、艺术展得分高）
- active: 活跃/运动（爬山、骑行、运动场馆得分高）
- indoor: 室内活动
- outdoor: 户外活动
- popular: 人气热门（评分高、客流大）
- budget_friendly: 性价比高
- quiet: 安静（书店、美术馆、茶馆得分高）
- trendy: 网红/新潮

## 输出格式
严格返回 JSON，不要任何额外文字：
{{
  "地点名称": {{"维度": 分数, ...}},
  ...
}}

## 注意事项
- 只对列表中出现的地点打标签，不要编造
- spicy 和 light_diet 互斥，同一地点不可能同时高分
- indoor 和 outdoor 互斥
- 分数精确到小数点后一位"""},
            {"role": "user", "content": f"地点列表:\n{poi_text}\n\n请返回 JSON 标签结果。"}
        ]

        try:
            llm = get_llm()
            response = llm.chat(messages, temperature=0.1, max_tokens=4000)
            content = response.get("choices", [{}])[0].get("message", {}).get("content", "")

            # 清理 markdown
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            result = json.loads(content.strip())

            # 归一化：确保每个地点都有所有维度
            normalized = {}
            for poi in pois:
                name = poi.get("name", "")
                tags = result.get(name, {})
                # 补全缺失维度
                for dim in self.TAG_DIMENSIONS:
                    if dim not in tags:
                        tags[dim] = 0.0
                normalized[name] = tags

            return normalized

        except Exception as e:
            print(f"[Tagging] 失败: {e}")
            # 失败时返回空标签
            return {p.get("name", ""): {dim: 0.0 for dim in self.TAG_DIMENSIONS} for p in pois}


_tagging_service = None


def get_tagging() -> TaggingService:
    global _tagging_service
    if _tagging_service is None:
        _tagging_service = TaggingService()
    return _tagging_service