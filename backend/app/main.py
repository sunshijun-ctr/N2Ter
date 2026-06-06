from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core import get_settings
from app.db import get_sessionmaker
from app.routes import api_router
from app.routes.websocket import router as websocket_router
from app.schemas import APIHealth


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)
app.include_router(websocket_router)


@app.get("/health", response_model=APIHealth)
async def health() -> APIHealth:
    return APIHealth(service=settings.app_name)


@app.get("/health/db")
async def database_health() -> dict[str, str]:
    async_session = get_sessionmaker()
    async with async_session() as session:
        database = await session.scalar(text("select current_database()"))
        version = await session.scalar(text("select version()"))
    return {"status": "ok", "database": database or "", "version": version or ""}
