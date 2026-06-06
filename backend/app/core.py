from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8")

    app_name: str = "N2Ter Backend"
    environment: Literal["local", "test", "production"] = "local"
    api_prefix: str = "/api"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    database_url: str = "postgresql+asyncpg://n2ter:n2ter@localhost:5432/n2ter"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    prompt_dir: Path = PROJECT_ROOT / "prompts"
    schema_dir: Path = PROJECT_ROOT / "Schema" / "V1"
    skill_dir: Path = PROJECT_ROOT / "skills"
    storage_dir: Path = BACKEND_DIR / "storage"

    # When True, long-running routes (preprocess / generate) dispatch to Celery
    # and return immediately with a pending task; clients poll the task /
    # progress endpoints. When False they run inline and complete in-request.
    async_tasks_enabled: bool = False

    # ----- Conversation auto-compression (Design.md §10.4.3) -----
    auto_compress_enabled: bool = True
    context_window_tokens: int = 200_000
    compression_trigger_ratio: float = 0.6
    compression_keep_recent: int = 6  # ~3 rounds (user+assistant) kept verbatim

    # ----- Conversation auto-title (Design.md §10.4.4) -----
    auto_title_enabled: bool = True
    auto_title_after_messages: int = 6  # 3 rounds (user + assistant)

    # ----- Auto-pin key decision messages (Design.md §10.4.3) -----
    auto_pin_enabled: bool = True
    pinned_keywords: list[str] = Field(
        default_factory=lambda: ["确认方案", "改编方案", "集数", "风格", "题材", "切换 Schema"]
    )

    @property
    def compression_trigger_tokens(self) -> int:
        return int(self.context_window_tokens * self.compression_trigger_ratio)

    # ----- LLM (OpenAI-compatible Chat Completions) -----
    # Leave llm_api_key empty to keep the deterministic fallback behaviour.
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.7
    llm_max_tokens: int = 4096
    llm_timeout_seconds: float = 120.0

    # ----- Embedding (OpenAI-compatible /embeddings) -----
    # Falls back to llm_api_key / a sibling base_url when left empty.
    embedding_base_url: str = ""
    embedding_api_key: str = ""
    embedding_model: str = "bge-m3"
    embedding_dim: int = 1024
    embedding_timeout_seconds: float = 60.0

    # ----- Rerank (BGE-reranker style HTTP endpoint) -----
    rerank_url: str = ""
    rerank_api_key: str = ""
    rerank_model: str = "bge-reranker-v2-m3"
    rerank_timeout_seconds: float = 30.0

    # ----- Vector store (Chroma) -----
    # When chroma_host is set, connect to a Chroma server over HTTP; otherwise
    # use an embedded persistent client at chroma_dir (good for local dev).
    chroma_host: str = ""
    chroma_port: int = 8000
    chroma_dir: Path = BACKEND_DIR / "storage" / "chroma"

    @property
    def chroma_server_enabled(self) -> bool:
        return bool(self.chroma_host)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_api_key and self.llm_base_url and self.llm_model)

    @property
    def effective_embedding_base_url(self) -> str:
        return self.embedding_base_url or self.llm_base_url

    @property
    def effective_embedding_api_key(self) -> str:
        return self.embedding_api_key or self.llm_api_key

    @property
    def embedding_enabled(self) -> bool:
        return bool(self.effective_embedding_api_key and self.effective_embedding_base_url)

    @property
    def rerank_enabled(self) -> bool:
        return bool(self.rerank_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
