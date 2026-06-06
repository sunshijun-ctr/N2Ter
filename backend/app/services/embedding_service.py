"""Embedding service backed by an OpenAI-compatible ``/embeddings`` endpoint.

Embeddings are cached permanently in Redis (key ``embed:{model}:{md5}``) because
the source novel never changes. When no embedding endpoint is configured the
service returns a deterministic pseudo-vector derived from the text hash so the
vector store still works offline and tests stay reproducible.
"""

import asyncio
import hashlib
import math
import struct

import httpx

from app.core import get_settings

try:  # redis is an install-time dependency, but stay defensive in tests.
    import redis.asyncio as aioredis
except ImportError:  # pragma: no cover
    aioredis = None  # type: ignore[assignment]


class EmbeddingService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._redis = None
        self._redis_loop = None

    @property
    def enabled(self) -> bool:
        return self._settings.embedding_enabled

    @property
    def dim(self) -> int:
        return self._settings.embedding_dim

    async def _get_redis(self):
        if aioredis is None:
            return None
        # redis.asyncio clients are bound to the event loop that created them.
        # Workers run each task on a fresh loop (asyncio.run), so re-create the
        # client whenever the running loop changes.
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # pragma: no cover - defensive
            loop = None
        if self._redis is not None and self._redis_loop is loop:
            return self._redis
        try:
            self._redis = aioredis.from_url(self._settings.redis_url)
            await self._redis.ping()
            self._redis_loop = loop
        except Exception:  # pragma: no cover - redis optional at runtime
            self._redis = None
            self._redis_loop = None
        return self._redis

    def _cache_key(self, text: str) -> str:
        digest = hashlib.md5(text.encode("utf-8")).hexdigest()
        return f"embed:{self._settings.embedding_model}:{digest}"

    def _fallback_vector(self, text: str) -> list[float]:
        """Deterministic unit-ish vector from the text hash (offline mode)."""
        dim = self.dim
        seed = hashlib.sha256(text.encode("utf-8")).digest()
        # Expand the 32-byte digest to `dim` floats deterministically.
        raw = bytearray()
        counter = 0
        while len(raw) < dim * 4:
            raw.extend(hashlib.sha256(seed + struct.pack(">I", counter)).digest())
            counter += 1
        values = [
            struct.unpack(">i", bytes(raw[i : i + 4]))[0] / 2_147_483_648.0
            for i in range(0, dim * 4, 4)
        ]
        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        return [v / norm for v in values]

    async def embed(self, text: str) -> list[float]:
        return (await self.embed_batch([text]))[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        results: list[list[float] | None] = [None] * len(texts)
        redis = await self._get_redis()

        # 1. Try cache.
        if redis is not None:
            try:
                keys = [self._cache_key(text) for text in texts]
                cached = await redis.mget(keys)
                for index, blob in enumerate(cached):
                    if blob:
                        count = len(blob) // 4
                        results[index] = list(struct.unpack(f"<{count}f", blob))
            except Exception:  # pragma: no cover - cache is best-effort
                redis = None

        missing = [i for i, value in enumerate(results) if value is None]
        if not missing:
            return [value for value in results if value is not None]  # type: ignore[misc]

        # 2. Compute missing vectors.
        missing_texts = [texts[i] for i in missing]
        if self.enabled:
            vectors = await self._call_api(missing_texts)
        else:
            vectors = [self._fallback_vector(text) for text in missing_texts]

        # 3. Fill + write back cache.
        to_cache: dict[str, bytes] = {}
        for slot, vector in zip(missing, vectors):
            results[slot] = vector
            if redis is not None and self.enabled:
                to_cache[self._cache_key(texts[slot])] = struct.pack(f"<{len(vector)}f", *vector)
        if to_cache and redis is not None:
            try:
                await redis.mset(to_cache)
            except Exception:  # pragma: no cover - cache is best-effort
                pass

        return [value for value in results if value is not None]  # type: ignore[misc]

    async def _call_api(self, texts: list[str]) -> list[list[float]]:
        settings = self._settings
        url = settings.embedding_base_url.rstrip("/") + "/embeddings"
        headers = {"Authorization": f"Bearer {settings.embedding_api_key}"}
        body = {"model": settings.embedding_model, "input": texts}
        async with httpx.AsyncClient(timeout=settings.embedding_timeout_seconds) as client:
            response = await client.post(url, json=body, headers=headers)
            response.raise_for_status()
            data = response.json()
        items = sorted(data["data"], key=lambda item: item.get("index", 0))
        return [item["embedding"] for item in items]


embedding_service = EmbeddingService()
