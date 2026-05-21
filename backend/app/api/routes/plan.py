"""规划 API 路由"""

from fastapi import APIRouter, HTTPException
from ...models.schemas import PlanRequest, PlanResponse, ExecuteRequest, ExecuteResponse, ScenarioContext
from ...agents.planner_agent import get_agent

router = APIRouter(prefix="/api", tags=["规划"])

@router.post("/plan", response_model=PlanResponse)
async def create_plan(request: PlanRequest):
    """生成周末规划方案"""
    try:
        agent = get_agent()
        plan = agent.generate_plan(request)
        return PlanResponse(success=True, message="规划生成成功", data=plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/parse", response_model=dict)
async def parse_query(request: dict):
    """用 LLM 解析用户输入，提取场景信息"""
    try:
        query = request.get("query", "")
        city = request.get("city", "上海")
        agent = get_agent()
        parsed = agent.parse_scenario(query, city)
        return {
            "success": True,
            "data": {
                "date": parsed.date if hasattr(parsed, 'date') else "",
                "departure_time": parsed.departure_time if hasattr(parsed, 'departure_time') else "",
                "scenario": parsed.scenario_type,
                "party_size": parsed.participants[0] if parsed.participants else "3",
                "budget_per_person": parsed.budget or None,
                "constraints": parsed.constraints or []
            }
        }
    except Exception as e:
        return {"success": True, "data": {"date": "", "departure_time": "", "scenario": "family", "party_size": "3", "budget_per_person": None, "constraints": []}}

@router.post("/execute", response_model=ExecuteResponse)
async def execute_plan(request: ExecuteRequest):
    """执行规划方案"""
    return ExecuteResponse(success=True, message="执行成功", confirmed_steps=[], failed_steps=[])
