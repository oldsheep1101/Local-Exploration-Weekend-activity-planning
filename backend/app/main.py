"""FastAPI 应用入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes.plan import router as plan_router
from .api.routes.users import router as users_router
from .models.schemas import HealthResponse
from .services.user_db import init_db, init_default_users

app = FastAPI(title="周末闲时规划 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(plan_router)
app.include_router(users_router)


@app.on_event("startup")
def startup():
    init_db()
    init_default_users()


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", version="1.0.0")
