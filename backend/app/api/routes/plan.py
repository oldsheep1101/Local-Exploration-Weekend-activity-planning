"""规划 API 路由"""

import os
import uuid
import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from ...services.pdf_service import _generate_pdf_async
from ...models.schemas import PlanRequest, DualPlanResponse, ExecuteRequest, ExecuteResponse, ScenarioContext, PlanStep, WeekendPlan
from ...agents.planner_agent import get_agent
from ...agents.validator_agent import get_validator
from ...services.user_db import get_user

router = APIRouter(prefix="/api", tags=["规划"])

AMAP_WEB_KEY = os.getenv("AMAP_WEB_KEY") or "6c299eb00d2b8672419fe520276ec10e"


# ============================================================================
# 用户偏好 & 硬约束（从数据库读取）
# ============================================================================

# 默认用户偏好（数据库未找到时 fallback）
DEFAULT_PREFERENCES = {
    "aesthetic": 0.5, "social": 0.5, "spicy": 0.5, "light_diet": 0.5,
    "family_friendly": 0.5, "indoor": 0.5, "outdoor": 0.5, "popular": 0.5,
    "quiet": 0.5, "trendy": 0.5, "romantic": 0.5, "active": 0.5, "budget_friendly": 0.5
}

DEFAULT_CONSTRAINTS = {"cannot_eat_spicy": False, "need_quiet": False, "need_indoor": False}


def _parse_mentions(query: str) -> list[str]:
    """从 '@alice @bob 下午出行' 中解析出被 @ 的人"""
    import re
    mentions = re.findall(r'@(\w+)', query)
    return mentions if mentions else ["default"]


def _get_user_configs(mentions: list[str]) -> tuple[list, list]:
    """从数据库读取用户偏好和约束列表"""
    prefs = []
    constraints = []
    for m in mentions:
        user = get_user(m)
        if user:
            prefs.append(user["preferences"])
            constraints.append(user["constraints"])
        else:
            prefs.append(DEFAULT_PREFERENCES)
            constraints.append(DEFAULT_CONSTRAINTS)
    return prefs, constraints


def geocode_address(address: str, city: str = "上海市") -> tuple[float, float]:
    """地理编码：地址 → 坐标"""
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
            if LON_MIN <= lon <= LON_MAX and LAT_MIN <= lat <= LAT_MAX:
                return lon, lat
    except Exception as e:
        print(f"[地理编码] 失败 {address}: {e}")
    return 121.4737, 31.2304  # 默认上海人民广场


def calculate_transit_for_plan(plan: WeekendPlan, is_family: bool = False) -> WeekendPlan:
    """通勤计算：插入交通步骤"""
    activity_steps = [s for s in plan.steps if s.type != "transport"]
    if len(activity_steps) < 2:
        return plan

    # 地理编码
    coords = []
    for step in activity_steps:
        addr = step.location or step.title
        addr = addr if "上海" in addr else f"上海市{addr}"
        lon, lat = geocode_address(addr)
        coords.append((lon, lat))

    # 查通勤
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
                duration = int(transits[0]["duration"])
                distance = transits[0].get("distance", 0)
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
            elif data.get("status") == "1" and data["route"].get("distance"):
                dist = int(data["route"]["distance"])
                if dist < 2000:
                    duration = min(int((dist / 5.0) * 3600), 1200)
                elif dist > 5000:
                    transit_data.append({"duration": 900, "distance": 0})
                    continue
                else:
                    duration = min(int((dist / 3.0) * 3600), 3600)
                transit_data.append({"duration": duration, "distance": dist, "is_walking": True})
            else:
                transit_data.append({"duration": 900, "distance": 0})
        except Exception as e:
            print(f"[通勤计算] API 失败: {e}")
            transit_data.append({"duration": 900, "distance": 0})

    # 构建步骤列表（活动 + 交通交替）
    new_steps = []
    current_minutes = 0
    first_time = activity_steps[0].time_range.split("-")[0] if activity_steps[0].time_range else "14:00"
    h, m = map(int, first_time.split(":"))
    current_minutes = h * 60 + m

    for idx, step in enumerate(activity_steps):
        activity_start = current_minutes
        activity_end = activity_start + (step.duration_minutes or 60)
        new_steps.append(PlanStep(
            step_id=step.step_id,
            type=step.type,
            title=step.title,
            description=step.description,
            time_range=f"{_fmt_h(current_minutes)}:{_fmt_m(activity_start)}-{_fmt_h(activity_end)}:{_fmt_m(activity_end)}",
            duration_minutes=step.duration_minutes or 60,
            location=step.location,
            booking_status=step.booking_status,
            booking_info=step.booking_info,
            risk_note=step.risk_note
        ))
        current_minutes = activity_end

        if idx < len(transit_data):
            transit = transit_data[idx]
            transit_minutes = transit["duration"] // 60
            transit_start = current_minutes
            transit_end = transit_start + transit_minutes
            line_info = transit.get("line_info", "")
            new_steps.append(PlanStep(
                step_id=f"transit-{idx}",
                type="transport",
                title="🚶 步行前往" if transit.get("is_walking") else ("🚇 公共交通前往" if not is_family else "🚗 自驾前往"),
                description=f"预计{transit_minutes}分钟{line_info}",
                time_range=f"{_fmt_h(transit_start)}:{_fmt_m(transit_start)}-{_fmt_h(transit_end)}:{_fmt_m(transit_end)}",
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


def _fmt_h(total_mins: int) -> str:
    return str((total_mins // 60) % 24).zfill(2)


def _fmt_m(total_mins: int) -> str:
    return str(total_mins % 60).zfill(2)


def _parse_scenario(query: str, city: str) -> ScenarioContext:
    """解析用户输入为场景"""
    from ...services.llm_service import get_llm
    try:
        llm = get_llm()
        result = llm.parse_query(query, city)
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


@router.post("/plan", response_model=DualPlanResponse)
async def create_plan(request: PlanRequest):
    """
    生成周末规划方案（新架构）。
    走 7 层流水线：
    1. 解析 @mentions → 读取偏好 & 约束
    2. POI 召回（高德）
    3. Tagging（一次 LLM）
    4. Ranking（纯代码）
    5. Planner（纯代码拼时间轴）
    6. Validator（天气/排队/约束修正）
    7. 通勤计算
    """
    try:
        # 1. 解析 @mentions
        mentions = _parse_mentions(request.query)
        prefs_list, constraints_list = _get_user_configs(mentions)

        # 2. 解析场景
        scenario = _parse_scenario(request.query, request.city)

        # 3. Tagging → Ranking → 拼时间轴（走 MultiPersonPlanner）
        planner = get_agent()
        if len(prefs_list) > 1:
            plan = planner.plan_multi(scenario, prefs_list, constraints_list)
        else:
            plan = planner.plan(scenario, prefs_list[0], constraints_list[0])

        # 4. Validator 修正
        validator = get_validator()
        plan = validator.validate_and_fix(plan, request.weather, scenario.constraints)

        # 5. 计算通勤
        is_family = plan.scenario.scenario_type == "family"
        plan = calculate_transit_for_plan(plan, is_family)

        print(f"[规划] 完成，共 {len(plan.steps)} 个步骤，得分 top POI: {[s.title for s in plan.steps if s.type != 'transport'][:3]}")

        return DualPlanResponse(
            success=True,
            message=f"已为 {len(mentions)} 位用户生成方案",
            indoor=plan,
            outdoor=None,
            weather_alert=None
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/parse", response_model=dict)
async def parse_query(request: dict):
    """解析用户输入，提取场景信息"""
    try:
        query = request.get("query", "")
        city = request.get("city", "上海")

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
    """根据起终点坐标查公共交通时间"""
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


@router.post("/export-pdf")
async def export_pdf(request: dict):
    """导出方案 PDF"""
    try:
        plan = request.get("plan", {})
        if not plan:
            return {"success": False, "message": "plan 数据为空"}
        pdf_bytes = await _generate_pdf_async(plan)
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=weekend-plan-{plan.get('plan_id', 'draft')[:6]}.pdf"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": str(e)}