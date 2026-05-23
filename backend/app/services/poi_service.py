"""高德 POI 搜索服务 - 保证地点真实性"""

import os
import requests
from typing import List, Dict, Any, Optional
from ..models.schemas import ScenarioContext

AMAP_WEB_KEY = os.getenv("AMAP_WEB_KEY") or "6c299eb00d2b8672419fe520276ec10e"

# 上海坐标范围校验
LON_MIN, LON_MAX = 120.8, 122.0
LAT_MIN, LAT_MAX = 30.7, 31.5


class POIInfo:
    """POI 信息"""
    def __init__(self, name: str, address: str, location: str, tel: str = "", type_: str = ""):
        self.name = name          # 名称
        self.address = address    # 地址
        self.location = location  # "lon,lat"
        self.tel = tel            # 电话
        self.type = type_         # 类型

    @property
    def longitude(self) -> float:
        return float(self.location.split(",")[0]) if self.location else 0

    @property
    def latitude(self) -> float:
        return float(self.location.split(",")[1]) if self.location else 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "address": self.address,
            "location": self.location,
            "tel": self.tel,
            "type": self.type
        }


def search_poi(keywords: str, city: str = "上海", limit: int = 5) -> List[POIInfo]:
    """调用高德 POI 文本搜索 API"""
    url = "https://restapi.amap.com/v3/place/text"
    params = {
        "key": AMAP_WEB_KEY,
        "keywords": keywords,
        "city": city,
        "citylimit": "true",
        "offset": str(limit),
        "page": 1,
        "extensions": "all"
    }
    try:
        r = requests.get(url, params=params, timeout=10)
        data = r.json()
        pois = []
        if data.get("status") == "1" and data.get("pois"):
            for p in data["pois"][:limit]:
                loc = p.get("location", "")
                # 校验坐标在上海范围内
                if loc:
                    parts = loc.split(",")
                    if len(parts) == 2:
                        try:
                            lon, lat = float(parts[0]), float(parts[1])
                            if not (LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX):
                                continue  # 跳过上海外的POI
                        except ValueError:
                            continue

                pois.append(POIInfo(
                    name=p.get("name", ""),
                    address=p.get("address", ""),
                    location=loc,
                    tel=p.get("tel", ""),
                    type_=p.get("type", "")
                ))
        return pois
    except Exception as e:
        print(f"[POI搜索] 失败 {keywords}: {e}")
        return []


def build_poi_context(pois: List[POIInfo]) -> str:
    """把 POI 列表格式化成 LLM 可读的字符串"""
    if not pois:
        return ""
    lines = []
    for i, p in enumerate(pois, 1):
        lines.append(f"{i}. {p.name} | 地址:{p.address} | 坐标:{p.location}")
    return "\n可选地点:\n" + "\n".join(lines)


# 根据场景类型返回 POI 搜索关键词
SCENARIO_KEYWORDS = {
    "family": ["亲子乐园", "儿童游乐场", "博物馆", "科技馆", "室内游乐场", "海洋馆", "动物园"],
    "friends": ["密室逃脱", "剧本杀", "KTV", "桌游吧", "咖啡厅", "商场", "美食街"],
    "couple": ["约会餐厅", "电影院", "展览", "公园", "酒吧", "艺术馆", "SPA"],
    "solo": ["书店", "咖啡厅", "展览", "博物馆", "健身房", "公园", "个人护理"],
    "casual": ["公园", "商场", "美食", "娱乐", "书店", "咖啡厅"]
}

# 活动类型关键词
ACTIVITY_KEYWORDS = {
    "family": ["亲子", "儿童", "家庭", "溜娃"],
    "friends": ["朋友", "聚会", "社交", "娱乐"],
    "couple": ["情侣", "约会", "浪漫", "二人世界"],
    "solo": ["独自", "一个人", "放松"],
    "casual": []
}


def search_pois_for_scenario(scenario: ScenarioContext, city: str = "上海") -> Dict[str, List[POIInfo]]:
    """根据场景搜索多组 POI，返回 {keyword: [POIInfo]}"""
    scenario_type = scenario.scenario_type or "casual"
    keywords = SCENARIO_KEYWORDS.get(scenario_type, SCENARIO_KEYWORDS["casual"])

    # 如果有约束条件，加入约束相关的搜索词
    extra_keywords = []
    for c in scenario.constraints:
        if "美食" in c or "吃" in c:
            extra_keywords.append("餐厅")
        if "安静" in c:
            extra_keywords.append("书咖")
        if "儿童" in c or "孩子" in c:
            extra_keywords.append("亲子")

    all_keywords = (keywords[:3] + extra_keywords[:2]) if extra_keywords else keywords[:3]

    results = {}
    for kw in all_keywords:
        pois = search_poi(kw, city=city, limit=5)
        if pois:
            results[kw] = pois

    return results


def format_pois_for_prompt(poi_results: Dict[str, List[POIInfo]]) -> str:
    """把 POI 搜索结果格式化成 LLM prompt 片段"""
    if not poi_results:
        return ""

    sections = []
    for keyword, pois in poi_results.items():
        if not pois:
            continue
        lines = [f"【{keyword}】"]
        for p in pois:
            lines.append(f"  - {p.name}，地址：{p.address}，坐标：{p.location}")
        sections.append("\n".join(lines))

    return "\n\n" + "\n".join(sections) + (
        "\n\n重要：规划时必须从上述真实地点中选择，不要自行编造地点名称。"
        "用餐地点请优先选择商场内餐厅或知名连锁餐厅。"
    )