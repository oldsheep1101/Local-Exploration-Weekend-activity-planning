"""用户管理 API"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from ...services.user_db import (
    get_user, save_user, delete_user, list_users,
    init_default_users, get_plan_history, save_plan_history
)

router = APIRouter(prefix="/api/users", tags=["用户"])


class UserSaveRequest(BaseModel):
    user_id: str
    preferences: Dict[str, float]
    constraints: Dict[str, bool]
    nickname: Optional[str] = ""


class UserResponse(BaseModel):
    user_id: str
    preferences: Dict[str, float]
    constraints: Dict[str, bool]
    nickname: str
    created_at: Optional[str] = None


@router.get("/", response_model=List[UserResponse])
async def get_users():
    """列出所有用户"""
    return list_users()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_info(user_id: str):
    """获取指定用户信息"""
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.post("/")
async def create_or_update_user(req: UserSaveRequest):
    """创建或更新用户"""
    save_user(req.user_id, req.preferences, req.constraints, req.nickname or "")
    return {"success": True, "message": f"用户 {req.user_id} 已保存"}


@router.delete("/{user_id}")
async def remove_user(user_id: str):
    """删除用户"""
    delete_user(user_id)
    return {"success": True, "message": f"用户 {user_id} 已删除"}


@router.post("/init")
async def init_users():
    """初始化默认用户（alice/bob/carol）"""
    init_default_users()
    return {"success": True, "message": "默认用户已初始化"}


@router.get("/{user_id}/history")
async def get_history(user_id: str, limit: int = 10):
    """获取用户规划历史"""
    return get_plan_history(user_id, limit)