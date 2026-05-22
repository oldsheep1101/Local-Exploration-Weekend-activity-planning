"""规划 API 路由"""

import os
import uuid
import requests
from fastapi import APIRouter, HTTPException
from ...models.schemas import PlanRequest, DualPlanResponse, ExecuteRequest, ExecuteResponse, ScenarioContext, PlanStep, WeekendPlan
from ...agents.planner_agent import get_agent

router = APIRouter(prefix="/api", tags=["规划"])

AMAP_WEB_KEY = os.getenv("AMAP_WEB_KEY") or "6c299eb00d2b8672419fe520276ec10e"

def geocode_address(address: str, city: str = "上海市") -> tuple[float, float]:
    """调用高德地理编码 API，将地址转为坐标 (lon, lat)"""
    import re
    clean = re.sub(r'[（）\(\)→→【】\[\]「」''""''，,、。.！!？?\s+]', '', address)
    url = "https://restapi.amap.com/v3/geocode/geo"
    params = {"key": AMAP_WEB_KEY, "address": clean, "city": city}
    LON_MIN, LON_MAX = 120.8, 122.0
    LAT_MIN, LAT_MAX = 30.7, 31.5
    try:
        r = requests.get(url, params=params, timeout=10)
        data = r.json()
        if data.get("status") == "1" and data.get("geocodes"):
            loc = data["geocodes"][0]["location"].split(",")
            lon, lat = float(loc[0]), float(loc[1])
            # 校验坐标是否在上海范围内
            if LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX:
                return lon, lat
            print(f"[地理编码] 坐标异常({lon},{lat})，使用默认坐标")
        # 如果清理后搜不到，试原地址
        params["address"] = address
        r = requests.get(url, params=params, timeout=10)
        data = r.json()
        if data.get("status") == "1" and data.get("geocodes"):
            loc = data["geocodes"][0]["location"].split(",")
            lon, lat = float(loc[0]), float(loc[1])
            if LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX:
                return lon, lat
            print(f"[地理编码] 坐标异常({lon},{lat})，使用默认坐标")
    except Exception as e:
        print(f"[地理编码] 失败 {address}: {e}")
    return 121.4737, 31.2304  # 默认上海人民广场


def calculate_transit_for_plan(plan: WeekendPlan, is_family: bool = False) -> WeekendPlan:
    """对单个方案计算通勤时间，插入交通步骤"""
    # 提取所有非 transport 步骤的地址
    activity_steps = [s for s in plan.steps if s.type != "transport"]
    if len(activity_steps) < 2:
        return plan

    # 1. 地理编码：地址 → 坐标
    coords = []
    for step in activity_steps:
        addr = step.location or step.title
        addr = addr if "上海" in addr else f"上海市{addr}"
        lon, lat = geocode_address(addr)
        coords.append((lon, lat))
    print(f"[通勤计算] 坐标: {coords}")

    # 2. 相邻坐标之间调高德公交 API
    transit_data = []
    for i in range(len(coords) - 1):
        origin = f"{coords[i][0]},{coords[i][1]}"
        destination = f"{coords[i+1][0]},{coords[i+1][1]}"
        url = "https://restapi.amap.com/v3/direction/transit/integrated"
        params = {"key": AMAP_WEB_KEY, "origin": origin, "destination": destination, "city": "上海市", "extensions": "base", "output": "json"}
        try:
            r = requests.get(url, params=params, timeout=30)
            data = r.json()
            transits = data.get("route", {}).get("transits", [])
            if data.get("status") == "1" and transits:
                duration = int(transits[0]["duration"])  # 秒
                if duration > 7200:
                    duration = min(duration, 7200)
                distance = transits[0].get("distance", 0)
                # 提取公交/地铁线路 + 上下车站
                line_info = ""
                booking_info = {}
                segs = transits[0].get("segments", [])
                line_info_parts = []
                lines = []
                for seg in segs:
                    for bl in seg.get("bus", {}).get("buslines", []):
                        name = bl.get("name", "")
                        departure_stop = bl.get("departure_stop", {}).get("name", "")
                        arrival_stop = bl.get("arrival_stop", {}).get("name", "")
                        if name:
                            lines.append(name)
                            if departure_stop and arrival_stop:
                                line_info_parts.append(f"{name}({departure_stop}→{arrival_stop})")
                            else:
                                line_info_parts.append(name)
                if line_info_parts:
                    unique_parts = list(dict.fromkeys(line_info_parts))
                    line_info = f"，{'→'.join(unique_parts[:3])}"
                    booking_info = {"lines": unique_parts}
                elif lines:
                    unique_lines = list(dict.fromkeys(lines))
                    line_info = f"，{'→'.join(unique_lines[:3])}"
                    booking_info = {"lines": unique_lines}
                transit_data.append({"duration": duration, "distance": distance, "line_info": line_info, "booking_info": booking_info, "is_walking": False})
                print(f"[通勤计算] {origin} → {destination}: {duration}秒, {distance}米{line_info}")
            elif data.get("status") == "1" and data["route"].get("distance"):
                # transits 为空但有直线距离
                dist = int(data["route"]["distance"])
                if dist < 2000:
                    # 短距离(<2km)按5km/h步行，上限20分钟
                    duration = min(int((dist / 5.0) * 3600), 1200)
                elif dist > 5000:
                    # 长距离(>5km)认为 geocode 失败，用15分钟默认
                    transit_data.append({"duration": 900, "distance": 0})
                    print(f"[通勤计算] {origin} → {destination}: 距离{dist}米>5km，跳过")
                    continue
                else:
                    # 中距离 2-5km，用3km/h步行，上限1小时
                    duration = min(int((dist / 3.0) * 3600), 3600)
                transit_data.append({"duration": duration, "distance": dist, "is_walking": True})
                print(f"[通勤计算] {origin} → {destination}: {duration//60}分钟(fallback walking), {dist}米")
            else:
                transit_data.append({"duration": 900, "distance": 0})  # 15分钟 fallback
        except Exception as e:
            print(f"[通勤计算] API 调用失败: {e}")
            transit_data.append({"duration": 900, "distance": 0})

    # 3. 构建新步骤列表（活动 + 交通交替）
    new_steps = []
    current_minutes = 0
    first_time = activity_steps[0].time_range.split("-")[0] if activity_steps[0].time_range else "14:00"
    h, m = map(int, first_time.split(":"))
    current_minutes = h * 60 + m

    for idx, step in enumerate(activity_steps):
        # 活动时间
        activity_start = current_minutes
        activity_end = activity_start + (step.duration_minutes or 60)
        new_steps.append(PlanStep(
            step_id=step.step_id,
            type=step.type,
            title=step.title,
            description=step.description,
            time_range=f"{hours(activity_start)}:{mins(activity_start)}-{hours(activity_end)}:{mins(activity_end)}",
            duration_minutes=step.duration_minutes or 60,
            location=step.location,
            booking_status=step.booking_status,
            booking_info=step.booking_info,
            risk_note=step.risk_note
        ))
        current_minutes = activity_end

        # 插入交通步骤
        if idx < len(transit_data):
            transit = transit_data[idx]
            transit_minutes = transit["duration"] // 60
            transit_start = current_minutes
            transit_end = transit_start + transit_minutes
            # 提取公交/地铁线路信息
            line_info = transit.get("line_info", "")
            new_steps.append(PlanStep(
                step_id=f"transit-{idx}",
                type="transport",
                title="🚶 步行前往" if transit.get("is_walking") else ("🚇 公共交通前往" if not is_family else "🚗 自驾前往"),
                description=f"预计{transit_minutes}分钟{line_info}",
                time_range=f"{hours(transit_start)}:{mins(transit_start)}-{hours(transit_end)}:{mins(transit_end)}",
                duration_minutes=transit_minutes,
                location=None,
                booking_status="pending",
                booking_info=transit.get("booking_info"),
                risk_note=None
            ))
            current_minutes = transit_end

    return WeekendPlan(
        plan_id=plan.plan_id,
        summary=plan.summary,
        scenario=plan.scenario,
        steps=new_steps,
        total_duration_hours=(current_minutes // 60) + (1 if current_minutes % 60 > 0 else 0),
        suggestions=plan.suggestions,
        total_estimate=plan.total_estimate,
        send_to=plan.send_to
    )


def hours(total_mins: int) -> str:
    return str((total_mins // 60) % 24).zfill(2)


def mins(total_mins: int) -> str:
    return str(total_mins % 60).zfill(2)


@router.post("/plan", response_model=DualPlanResponse)
async def create_plan(request: PlanRequest):
    """生成周末规划方案（室内版 + 室外版），内置通勤计算"""
    try:
        agent = get_agent()
        result = agent.generate_dual_plan(request)

        indoor = result.get("indoor")
        outdoor = result.get("outdoor")

        # 计算通勤并插入交通步骤
        if indoor:
            is_family = indoor.scenario.scenario_type == "family"
            indoor = calculate_transit_for_plan(indoor, is_family)
            print(f"[规划] 室内方案计算通勤完成，共 {len(indoor.steps)} 个步骤")

        if outdoor:
            is_family = outdoor.scenario.scenario_type == "family"
            outdoor = calculate_transit_for_plan(outdoor, is_family)
            print(f"[规划] 室外方案计算通勤完成，共 {len(outdoor.steps)} 个步骤")

        return DualPlanResponse(
            success=result["success"],
            message=result["message"],
            indoor=indoor,
            outdoor=outdoor,
            weather_alert=result.get("weather_alert")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/parse", response_model=dict)
async def parse_query(request: dict):
    """用 LLM 解析用户输入，提取场景信息"""
    try:
        query = request.get("query", "")
        city = request.get("city", "上海")
        
        # 直接调 LLMService，不走 agent 中间层
        from ...services.llm_service import get_llm
        llm = get_llm()
        parsed = llm.parse_query(query, city)
        
        return {
            "success": True,
            "data": {
                "date": parsed.get("date", ""),
                "departure_time": parsed.get("departure_time", ""),
                "scenario": parsed.get("scenario", "casual"),
                "party_size": parsed.get("party_size", 1),
                "budget_per_person": parsed.get("budget_per_person"),
                "constraints": parsed.get("constraints", [])
            }
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "data": {
                "date": "", "departure_time": "",
                "scenario": "casual", "party_size": 1,
                "budget_per_person": None, "constraints": []
            }
        }
        
@router.post("/transit-time")
async def get_transit_time(request: dict):
    """根据起终点坐标查询公共交通时间（秒）"""
    import os, requests
    origin = request.get("origin", "")
    destination = request.get("destination", "")
    city = request.get("city", "上海市")
    key = os.getenv("AMAP_WEB_KEY") or "6c299eb00d2b8672419fe520276ec10e"
    url = "https://restapi.amap.com/v3/direction/transit/integrated"
    params = {
        "key": key,
        "origin": origin,
        "destination": destination,
        "city": city,
        "extensions": "base",
        "output": "json"
    }
    try:
        r = requests.get(url, params=params, timeout=30)
        data = r.json()
        if data.get("status") == "1" and data["route"].get("transits"):
            duration = int(data["route"]["transits"][0]["duration"])
            distance = data["route"]["transits"][0].get("distance", 0)
            return {"success": True, "duration": duration, "distance": distance}
    except Exception as e:
        return {"success": False, "duration": None, "distance": 0, "error": str(e)}
    return {"success": False, "duration": None, "distance": 0}

@router.post("/execute", response_model=ExecuteResponse)
async def execute_plan(request: ExecuteRequest):
    """执行规划方案"""
    return ExecuteResponse(success=True, message="执行成功", confirmed_steps=[], failed_steps=[])
