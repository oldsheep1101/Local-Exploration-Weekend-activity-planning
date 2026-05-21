"""周末闲时规划 Agent - 数据模型"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# ============ 请求模型 ============

class PlanRequest(BaseModel):
    """规划请求"""
    query: str = Field(..., description="用户自然语言查询", example="今天下午是空的，想和老婆孩子出去玩几个小时，孩子5岁，老婆最近在减肥")
    city: str = Field(default="上海", description="城市", example="上海")
    user_location: Optional[str] = Field(default=None, description="用户位置", example="上海市浦东新区")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "今天下午是空的，想和老婆孩子出去玩几个小时，孩子5岁，老婆最近在减肥",
                "city": "上海",
                "user_location": "上海市浦东新区"
            }
        }


class ExecuteRequest(BaseModel):
    """执行请求"""
    plan_id: str = Field(..., description="计划ID")
    confirm: bool = Field(default=True, description="是否确认执行")


# ============ 场景模型 ============

class ScenarioContext(BaseModel):
    """场景上下文"""
    date: str = Field(default="", description="出行日期 YYYY-MM-DD")
    departure_time: str = Field(default="", description="出发时间 HH:MM")
    scenario_type: str = Field(..., description="场景类型: family/friends/couple/solo")
    constraints: List[str] = Field(default_factory=list, description="约束条件")
    participants: List[str] = Field(default_factory=list, description="参与者")
    duration_hours: float = Field(default=4.0, description="可用时长(小时)")
    budget: Optional[str] = Field(default=None, description="预算")


# ============ 工具定义 ============

class ToolDefinition(BaseModel):
    """工具定义"""
    name: str = Field(..., description="工具名称")
    description: str = Field(..., description="工具描述")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="参数 schema")


class ToolCall(BaseModel):
    """工具调用"""
    tool_name: str = Field(..., description="工具名称")
    arguments: Dict[str, Any] = Field(default_factory=dict, description="调用参数")


class ToolResult(BaseModel):
    """工具执行结果"""
    success: bool = Field(..., description="是否成功")
    data: Any = Field(default=None, description="返回数据")
    error: Optional[str] = Field(default=None, description="错误信息")
    alternatives: List[Dict[str, Any]] = Field(default_factory=list, description="备选方案")


# ============ 规划步骤 ============

class PlanStep(BaseModel):
    """规划步骤"""
    step_id: str = Field(..., description="步骤ID")
    type: str = Field(..., description="步骤类型: activity/food/transport/extra")
    title: str = Field(..., description="步骤标题")
    description: str = Field(..., description="步骤描述")
    time_range: str = Field(..., description="时间范围", example="14:00-16:00")
    duration_minutes: int = Field(..., description="持续时间(分钟)")
    tool_call: Optional[ToolCall] = Field(default=None, description="需要的工具调用")
    location: Optional[str] = Field(default=None, description="地点")
    booking_status: str = Field(default="pending", description="预订状态: pending/confirmed/failed")
    booking_info: Optional[Dict[str, Any]] = Field(default=None, description="预订信息")


# ============ 完整方案 ============

class WeekendPlan(BaseModel):
    """周末方案"""
    plan_id: str = Field(..., description="计划ID")
    summary: str = Field(..., description="方案摘要")
    scenario: ScenarioContext = Field(..., description="场景信息")
    steps: List[PlanStep] = Field(default_factory=list, description="执行步骤")
    total_duration_hours: float = Field(..., description="总时长(小时)")
    total_estimate: Optional[str] = Field(default=None, description="总花费估算")
    suggestions: List[str] = Field(default_factory=list, description="建议")
    send_to: Optional[str] = Field(default=None, description="发送给谁")


class PlanResponse(BaseModel):
    """规划响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(default="", description="消息")
    data: Optional[WeekendPlan] = Field(default=None, description="规划数据")


class ExecuteResponse(BaseModel):
    """执行响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(default="", description="消息")
    confirmed_steps: List[str] = Field(default_factory=list, description="已确认步骤")
    failed_steps: List[Dict[str, str]] = Field(default_factory=list, description="失败步骤")


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str = Field(default="ok")
    version: str = Field(default="1.0.0")
