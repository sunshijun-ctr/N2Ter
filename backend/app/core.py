from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BASE_DIR.parent
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8")

    app_name: str = "N2Ter Backend"
    environment: Literal["local", "test", "production"] = "local"
    api_prefix: str = "/api"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    database_url: str = "postgresql+asyncpg://n2ter:n2ter@localhost:5432/n2ter"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    prompt_dir: Path = ROOT_DIR / "prompts"
    schema_dir: Path = ROOT_DIR / "Schema" / "V1"
    skill_dir: Path = ROOT_DIR / "skills"
    storage_dir: Path = BASE_DIR / "storage"


@lru_cache
def get_settings() -> Settings:
    return Settings()
