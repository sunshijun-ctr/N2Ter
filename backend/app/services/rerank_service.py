"""Rerank service for a BGE-reranker style HTTP endpoint.

Given a query and a list of candidate items (dicts), it returns them reordered
by relevance and truncated to ``top_k``. When no endpoint is configured it is a
passthrough (optionally truncating), so the retrieval pipeline still works.
"""

from typing import Any

import httpx

from app.core import get_settings


class RerankService:
    def __init__(self) -> None:
        self._settings = get_settings()

    @property
    def enabled(self) -> bool:
        return self._settings.rerank_enabled

    async def rerank(
        self,
        query: str,
        items: list[dict[str, Any]],
        top_k: int | None = None,
        text_key: str = "content",
    ) -> list[dict[str, Any]]:
        if not items:
            return []
        if not self.enabled:
            return items[:top_k] if top_k else items

        documents = [str(item.get(text_key, "")) for item in items]
        try:
            scores = await self._call_api(query, documents)
        except httpx.HTTPError:
            # Never let rerank failure break retrieval.
            return items[:top_k] if top_k else items

        ranked = sorted(
            zip(items, scores), key=lambda pair: pair[1], reverse=True
        )
        result = [
            {**item, "relevance_score": score} for item, score in ranked
        ]
        return result[:top_k] if top_k else result

    @property
    def _is_dashscope(self) -> bool:
        # DashScope's text-rerank endpoint is NOT OpenAI-compatible: it wraps the
        # payload in input/parameters and returns results under "output".
        return "/services/rerank" in self._settings.rerank_url

    async def _call_api(self, query: str, documents: list[str]) -> list[float]:
        settings = self._settings
        headers = {}
        if settings.rerank_api_key:
            headers["Authorization"] = f"Bearer {settings.rerank_api_key}"

        if self._is_dashscope:
            body: dict[str, Any] = {
                "model": settings.rerank_model,
                "input": {"query": query, "documents": documents},
                # top_n = all docs so every candidate gets a score; we reorder/cut
                # ourselves afterwards. return_documents off (we map by index).
                "parameters": {"return_documents": False, "top_n": len(documents)},
            }
        else:
            body = {"model": settings.rerank_model, "query": query, "documents": documents}

        async with httpx.AsyncClient(timeout=settings.rerank_timeout_seconds) as client:
            response = await client.post(settings.rerank_url, json=body, headers=headers)
            response.raise_for_status()
            data = response.json()

        # DashScope: {"output": {"results": [{"index", "relevance_score"}]}}.
        # OpenAI/Jina style: {"results": [...]} or {"scores": [...]}.
        results = data.get("results")
        if isinstance(data.get("output"), dict):
            results = data["output"].get("results", results)

        scores = [0.0] * len(documents)
        if isinstance(results, list):
            for entry in results:
                idx = entry.get("index")
                if idx is not None and 0 <= idx < len(scores):
                    scores[idx] = float(
                        entry.get("relevance_score", entry.get("score", 0.0))
                    )
        elif isinstance(data.get("scores"), list):
            for idx, value in enumerate(data["scores"][: len(scores)]):
                scores[idx] = float(value)
        return scores


rerank_service = RerankService()
