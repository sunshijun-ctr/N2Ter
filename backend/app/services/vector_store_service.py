"""Chroma-backed vector store for semantic scene retrieval.

``chromadb`` is an optional dependency. When it is not installed (or fails to
initialise) the service reports ``available is False`` and callers fall back to
SQL substring search, so the system keeps working without the vector DB.
"""

import json
from typing import Any

from app.core import get_settings


class VectorStoreService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._client = None
        self._init_attempted = False

    @property
    def available(self) -> bool:
        return self._get_client() is not None

    def _get_client(self):
        if self._init_attempted:
            return self._client
        self._init_attempted = True
        try:
            import chromadb

            if self._settings.chroma_server_enabled:
                # Connect to the standalone Chroma server (docker-compose).
                self._client = chromadb.HttpClient(
                    host=self._settings.chroma_host,
                    port=self._settings.chroma_port,
                )
            else:
                # Embedded persistent client for local development.
                self._settings.chroma_dir.mkdir(parents=True, exist_ok=True)
                self._client = chromadb.PersistentClient(path=str(self._settings.chroma_dir))
        except Exception:  # pragma: no cover - chroma optional / server may be down
            self._client = None
        return self._client

    def _collection(self, novel_id: str):
        client = self._get_client()
        if client is None:
            return None
        return client.get_or_create_collection(
            name=f"novel_{novel_id}_scenes",
            metadata={"hnsw:space": "cosine"},
        )

    def upsert(
        self,
        novel_id: str,
        ids: list[str],
        embeddings: list[list[float]],
        documents: list[str],
        metadatas: list[dict[str, Any]],
    ) -> bool:
        collection = self._collection(novel_id)
        if collection is None or not ids:
            return False
        safe_metadatas = [self._sanitise(meta) for meta in metadatas]
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=safe_metadatas,
        )
        return True

    def query(
        self,
        novel_id: str,
        query_embedding: list[float],
        top_k: int = 20,
        where: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        collection = self._collection(novel_id)
        if collection is None:
            return []
        result = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where or None,
        )
        ids = (result.get("ids") or [[]])[0]
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        items: list[dict[str, Any]] = []
        for index, scene_id in enumerate(ids):
            meta = metadatas[index] if index < len(metadatas) else {}
            items.append(
                {
                    "scene_id": scene_id,
                    "content": documents[index] if index < len(documents) else "",
                    "chapter_num": meta.get("chapter_num"),
                    "scene_index": meta.get("scene_index"),
                    "description": meta.get("description"),
                    "characters": self._restore_characters(meta.get("characters")),
                    "distance": distances[index] if index < len(distances) else None,
                }
            )
        return items

    def delete_novel(self, novel_id: str) -> None:
        client = self._get_client()
        if client is None:
            return
        try:
            client.delete_collection(name=f"novel_{novel_id}_scenes")
        except Exception:  # pragma: no cover - collection may not exist
            pass

    @staticmethod
    def _sanitise(meta: dict[str, Any]) -> dict[str, Any]:
        """Chroma metadata values must be str/int/float/bool."""
        clean: dict[str, Any] = {}
        for key, value in meta.items():
            if isinstance(value, (str, int, float, bool)) or value is None:
                clean[key] = value
            else:
                clean[key] = json.dumps(value, ensure_ascii=False)
        return clean

    @staticmethod
    def _restore_characters(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        return value or []


vector_store_service = VectorStoreService()
