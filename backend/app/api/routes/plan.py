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
        
@router.post("/execute", response_model=ExecuteResponse)
async def execute_plan(request: ExecuteRequest):
    """执行规划方案"""
    return ExecuteResponse(success=True, message="执行成功", confirmed_steps=[], failed_steps=[])
