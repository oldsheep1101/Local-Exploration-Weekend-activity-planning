"""用户数据库 - SQLite 持久化"""

import sqlite3
import json
import os
from typing import Dict, Any, Optional, List

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "users.db")


def _get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """初始化数据库"""
    conn = _get_conn()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            preferences TEXT NOT NULL DEFAULT '{}',
            constraints TEXT NOT NULL DEFAULT '{}',
            nickname TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS plan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            plan_id TEXT NOT NULL,
            query TEXT,
            plan_data TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    """)
    conn.commit()
    conn.close()


def save_user(user_id: str, preferences: Dict[str, Any], constraints: Dict[str, bool], nickname: str = "") -> bool:
    """保存或更新用户"""
    conn = _get_conn()
    conn.execute("""
        INSERT INTO users (user_id, preferences, constraints, nickname)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            preferences = excluded.preferences,
            constraints = excluded.constraints,
            nickname = excluded.nickname
    """, (user_id, json.dumps(preferences, ensure_ascii=False), json.dumps(constraints, ensure_ascii=False), nickname))
    conn.commit()
    conn.close()
    return True


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """读取用户"""
    conn = _get_conn()
    row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "user_id": row["user_id"],
        "preferences": json.loads(row["preferences"]),
        "constraints": json.loads(row["constraints"]),
        "nickname": row["nickname"],
        "created_at": row["created_at"]
    }


def list_users() -> List[Dict[str, Any]]:
    """列出所有用户"""
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM users").fetchall()
    conn.close()
    return [
        {
            "user_id": r["user_id"],
            "preferences": json.loads(r["preferences"]),
            "constraints": json.loads(r["constraints"]),
            "nickname": r["nickname"],
            "created_at": r["created_at"]
        }
        for r in rows
    ]


def delete_user(user_id: str) -> bool:
    """删除用户"""
    conn = _get_conn()
    conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()
    return True


def save_plan_history(user_id: str, plan_id: str, query: str, plan_data: Dict[str, Any]):
    """保存规划历史"""
    conn = _get_conn()
    conn.execute("""
        INSERT INTO plan_history (user_id, plan_id, query, plan_data)
        VALUES (?, ?, ?, ?)
    """, (user_id, plan_id, query, json.dumps(plan_data, ensure_ascii=False, default=str)))
    conn.commit()
    conn.close()


def get_plan_history(user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """读取规划历史"""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM plan_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit)
    ).fetchall()
    conn.close()
    return [
        {
            "plan_id": r["plan_id"],
            "query": r["query"],
            "plan_data": json.loads(r["plan_data"]),
            "created_at": r["created_at"]
        }
        for r in rows
    ]


# 默认用户偏好
DEFAULT_USERS = {
    "alice": {
        "preferences": {
            "aesthetic": 0.9, "social": 0.3, "spicy": 0.1, "light_diet": 0.8,
            "family_friendly": 0.6, "indoor": 0.8, "outdoor": 0.4, "popular": 0.7,
            "quiet": 0.9, "trendy": 0.5, "romantic": 0.6, "active": 0.3, "budget_friendly": 0.5
        },
        "constraints": {"cannot_eat_spicy": True, "need_quiet": False, "need_indoor": False}
    },
    "bob": {
        "preferences": {
            "aesthetic": 0.4, "social": 0.9, "spicy": 0.1, "light_diet": 0.3,
            "family_friendly": 0.2, "indoor": 0.5, "outdoor": 0.7, "popular": 0.8,
            "quiet": 0.3, "trendy": 0.9, "romantic": 0.4, "active": 0.8, "budget_friendly": 0.5
        },
        "constraints": {"cannot_eat_spicy": True, "need_quiet": False, "need_indoor": False}
    },
    "carol": {
        "preferences": {
            "aesthetic": 0.5, "social": 0.9, "spicy": 0.2, "light_diet": 0.5,
            "family_friendly": 0.3, "indoor": 0.6, "outdoor": 0.5, "popular": 0.7,
            "quiet": 0.2, "trendy": 0.8, "romantic": 0.7, "active": 0.5, "budget_friendly": 0.6
        },
        "constraints": {"cannot_eat_spicy": False, "need_quiet": False, "need_indoor": False}
    }
}


def init_default_users():
    """初始化默认用户到数据库"""
    for user_id, data in DEFAULT_USERS.items():
        save_user(user_id, data["preferences"], data["constraints"], nickname=user_id)


def _ensure_data_dir():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)