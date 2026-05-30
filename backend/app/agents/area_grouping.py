"""Area Grouping - 按地理区域聚类 POI，限制通勤"""

import math
from typing import Dict, Any, List, Tuple
from ..services.poi_service import POIInfo


# 上海主要区域中心坐标
DISTRICTS = {
    "黄浦": (121.4905, 31.2222),
    "静安": (121.4549, 31.2295),
    "徐汇": (121.4227, 31.1887),
    "长宁": (121.4196, 31.2205),
    "普陀": (121.3954, 31.2419),
    "虹口": (121.5073, 31.2698),
    "杨浦": (121.5253, 31.2650),
    "浦东": (121.5441, 31.2213),
    "闵行": (121.3759, 31.1114),
    "宝山": (121.4354, 31.2410),
    "嘉定": (121.2441, 31.3831),
    "松江": (121.2278, 31.0322),
    "青浦": (121.1133, 31.1519),
    "奉贤": (121.4731, 30.9354),
    "金山": (121.3308, 30.7429),
}

# 相邻区域（允许跨区但通勤不超过30min）
ADJACENT = {
    "黄浦": ["静安", "浦东", "徐汇"],
    "静安": ["黄浦", "徐汇", "虹口", "普陀"],
    "徐汇": ["黄浦", "静安", "长宁", "闵行"],
    "长宁": ["徐汇", "静安", "闵行"],
    "普陀": ["静安", "虹口", "宝山", "嘉定"],
    "虹口": ["静安", "普陀", "杨浦"],
    "杨浦": ["虹口", "浦东"],
    "浦东": ["黄浦", "杨浦", "闵行"],
    "闵行": ["徐汇", "长宁", "浦东", "松江", "奉贤"],
    "宝山": ["普陀", "嘉定"],
    "嘉定": ["普陀", "宝山", "青浦", "松江"],
    "松江": ["闵行", "嘉定", "青浦", "金山"],
    "青浦": ["嘉定", "松江", "金山"],
    "奉贤": ["闵行", "金山"],
    "金山": ["松江", "青浦", "奉贤"],
}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """计算两点间 Haversine 距离（米）"""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def district_of(lon: float, lat: float) -> str:
    """返回最近的区域名"""
    min_dist = float('inf')
    best = "其他"
    for name, (dl, dp) in DISTRICTS.items():
        d = haversine_m(lat, lon, dp, dl)
        if d < min_dist:
            min_dist = d
            best = name
    return best


def transit_time_minutes(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """
    估算公共交通通勤时间（分钟）。
    直线距离 < 2km 按步行算，>= 2km 按公交30min基础+1min/km算。
    """
    dist_m = haversine_m(lat1, lon1, lat2, lon2)
    if dist_m < 2000:
        # 步行 5km/h
        return max(int(dist_m / 5 / 60 * 60), 10)
    else:
        # 公交：基础30min + 每公里1min，上限60min
        dist_km = dist_m / 1000
        return min(int(30 + dist_km), 60)


def tag_district(poi: Dict[str, Any]) -> Dict[str, Any]:
    """给 POI 打上区域标签"""
    loc = poi.get("location", "")
    if not loc:
        poi["_district"] = "其他"
        poi["_transit_to_center"] = 30
        return poi
    try:
        lon, lat = map(float, loc.split(","))
        d = district_of(lon, lat)
        poi["_district"] = d
        # 估算到区域中心的通勤
        center = DISTRICTS.get(d, (121.4737, 31.2304))
        poi["_transit_to_center"] = transit_time_minutes(lat, lon, center[1], center[0])
    except:
        poi["_district"] = "其他"
        poi["_transit_to_center"] = 30
    return poi


def group_by_district(pois: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """按区域分组 POI"""
    groups = {}
    for poi in pois:
        d = poi.get("_district", "其他")
        if d not in groups:
            groups[d] = []
        groups[d].append(poi)
    return groups


def choose_best_district(groups: Dict[str, List[Dict[str, Any]]], prefer_district: str = None) -> str:
    """
    选择最佳区域：优先选有最多 pool 类型的区域。
    如果 prefer_district 指定，优先用它。
    """
    if prefer_district and prefer_district in groups and len(groups[prefer_district]) >= 2:
        return prefer_district

    best = max(groups.keys(), key=lambda d: len(groups[d]))
    return best


def cluster_itinerary_pois(
    activity_pois: List[Dict[str, Any]],
    food_pois: List[Dict[str, Any]],
    optional_pois: List[Dict[str, Any]],
    max_transit_minutes: int = 30
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Area Grouping 主函数。
    从每个 pool 里挑出位于同一区域（或相邻区域）的 POI，通勤不超过 max_transit_minutes。

    如果同一区域内 POI 不足：
    - Level 1: 允许跨相邻区域
    - Level 2: 扩大通勤阈值到 45min
    - Level 3: 只保 activity + food，放弃 optional
    """
    # 先给每个 POI 打区域标签
    for p in activity_pois + food_pois + optional_pois:
        tag_district(p)

    all_pois = {p["name"]: p for p in activity_pois + food_pois + optional_pois}

    # 统计每个区域的 POI 覆盖情况
    district_pool_count: Dict[str, Dict[str, int]] = {}
    for poi in all_pois.values():
        d = poi["_district"]
        pool = poi.get("_pool", "activity")
        if d not in district_pool_count:
            district_pool_count[d] = {"activity": 0, "food": 0, "optional": 0}
        district_pool_count[d][pool] = district_pool_count[d].get(pool, 0) + 1

    # 选最佳区域
    target_district = choose_best_district(district_pool_count)

    def in_range(poi: Dict[str, Any]) -> bool:
        d = poi["_district"]
        transit = poi.get("_transit_to_center", 30)
        return d == target_district or d in ADJACENT.get(target_district, [])

    # Level 1: 同区 + 相邻区域
    activity_selected = [p for p in activity_pois if in_range(p)]
    food_selected = [p for p in food_pois if in_range(p)]
    optional_selected = [p for p in optional_pois if in_range(p)]

    # Level 2: 如果每个 pool 都有候选，直接返回
    if activity_selected and food_selected:
        return activity_selected, food_selected, optional_selected

    # Level 2: 放宽到 45min
    activity_selected = [p for p in activity_pois if p.get("_transit_to_center", 30) <= 45]
    food_selected = [p for p in food_pois if p.get("_transit_to_center", 30) <= 45]
    optional_selected = [p for p in optional_pois if p.get("_transit_to_center", 30) <= 45]

    if activity_selected and food_selected:
        return activity_selected, food_selected, optional_selected

    # Level 3: 只保 activity + food
    activity_selected = activity_pois[:3] if not activity_selected else activity_selected
    food_selected = food_pois[:3] if not food_selected else food_selected

    return activity_selected, food_selected, []


def estimate_itinerary_transit(pois: List[Dict[str, Any]]) -> int:
    """估算整个行程的总通勤时间（分钟）"""
    if len(pois) < 2:
        return 0
    total = 0
    for i in range(len(pois) - 1):
        try:
            loc1 = pois[i].get("location", "")
            loc2 = pois[i + 1].get("location", "")
            if loc1 and loc2:
                lon1, lat1 = map(float, loc1.split(","))
                lon2, lat2 = map(float, loc2.split(","))
                total += transit_time_minutes(lat1, lon1, lat2, lon2)
        except:
            pass
    return total