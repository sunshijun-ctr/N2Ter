from fastapi import APIRouter

from app.routes import conversations, exports, novels, screenplays, skills, tasks

api_router = APIRouter()
api_router.include_router(novels.router)
api_router.include_router(screenplays.router)
api_router.include_router(conversations.router)
api_router.include_router(tasks.router)
api_router.include_router(exports.router)
api_router.include_router(skills.router)
