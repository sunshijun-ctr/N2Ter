from typing import Any
from uuid import UUID

from sqlalchemy import or_, select

from app.db import get_sessionmaker
from app.models import Chapter, Character, Novel, SceneInNovel
from app.services.embedding_service import embedding_service
from app.services.rerank_service import rerank_service
from app.services.vector_store_service import vector_store_service


class NovelContextService:
    async def chapter_get(self, novel_id: str, chapter_num: int, mode: str = "full") -> dict[str, Any]:
        async_session = get_sessionmaker()
        async with async_session() as session:
            result = await session.execute(
                select(Chapter).where(
                    Chapter.novel_id == UUID(novel_id),
                    Chapter.chapter_num == chapter_num,
                )
            )
            chapter = result.scalar_one_or_none()
            if not chapter:
                raise LookupError("Chapter not found")

            data: dict[str, Any] = {
                "id": str(chapter.id),
                "chapter_num": chapter.chapter_num,
                "title": chapter.title,
                "word_count": chapter.word_count,
                "summary": chapter.summary,
                "key_events": chapter.key_events,
            }
            if mode == "summary":
                return data
            if mode == "key_events":
                return {**data, "content": None}
            return {**data, "content": chapter.content}

    async def chapter_search(
        self,
        novel_id: str,
        query: str,
        top_k: int = 5,
        chapter_range: tuple[int, int] | None = None,
    ) -> list[dict[str, Any]]:
        if vector_store_service.available:
            vector_results = await self._vector_search(novel_id, query, top_k, chapter_range)
            if vector_results:
                return vector_results
        return await self._sql_search(novel_id, query, top_k, chapter_range)

    async def _vector_search(
        self,
        novel_id: str,
        query: str,
        top_k: int,
        chapter_range: tuple[int, int] | None,
    ) -> list[dict[str, Any]]:
        query_embedding = await embedding_service.embed(query)
        where: dict[str, Any] | None = None
        if chapter_range:
            where = {
                "$and": [
                    {"chapter_num": {"$gte": chapter_range[0]}},
                    {"chapter_num": {"$lte": chapter_range[1]}},
                ]
            }
        candidates = vector_store_service.query(
            novel_id, query_embedding, top_k=max(top_k * 4, top_k), where=where
        )
        if not candidates:
            return []
        ranked = await rerank_service.rerank(query, candidates, top_k=top_k)

        # Re-hydrate canonical fields from the DB so content stays authoritative.
        scene_ids = [UUID(item["scene_id"]) for item in ranked if item.get("scene_id")]
        async_session = get_sessionmaker()
        async with async_session() as session:
            rows = await session.execute(
                select(SceneInNovel, Chapter.chapter_num)
                .join(Chapter, Chapter.id == SceneInNovel.chapter_id)
                .where(SceneInNovel.id.in_(scene_ids))
            )
            by_id = {
                str(scene.id): (scene, chapter_num) for scene, chapter_num in rows
            }
        results: list[dict[str, Any]] = []
        for item in ranked:
            entry = by_id.get(item.get("scene_id"))
            if not entry:
                continue
            scene, chapter_num = entry
            results.append(
                {
                    "scene_id": str(scene.id),
                    "chapter_num": chapter_num,
                    "scene_index": scene.scene_index,
                    "description": scene.description,
                    "content": scene.content,
                    "characters": scene.characters,
                    "relevance_score": item.get("relevance_score"),
                }
            )
        return results

    async def _sql_search(
        self,
        novel_id: str,
        query: str,
        top_k: int = 5,
        chapter_range: tuple[int, int] | None = None,
    ) -> list[dict[str, Any]]:
        async_session = get_sessionmaker()
        async with async_session() as session:
            statement = (
                select(SceneInNovel, Chapter.chapter_num)
                .join(Chapter, Chapter.id == SceneInNovel.chapter_id)
                .where(SceneInNovel.novel_id == UUID(novel_id))
                .where(or_(SceneInNovel.content.ilike(f"%{query}%"), SceneInNovel.description.ilike(f"%{query}%")))
                .order_by(Chapter.chapter_num.asc(), SceneInNovel.scene_index.asc())
                .limit(top_k)
            )
            if chapter_range:
                statement = statement.where(
                    Chapter.chapter_num >= chapter_range[0],
                    Chapter.chapter_num <= chapter_range[1],
                )
            rows = await session.execute(statement)
            return [
                {
                    "scene_id": str(scene.id),
                    "chapter_num": chapter_num,
                    "scene_index": scene.scene_index,
                    "description": scene.description,
                    "content": scene.content,
                    "characters": scene.characters,
                }
                for scene, chapter_num in rows
            ]

    async def character_timeline(
        self, novel_id: str, character_name: str, chapter_range: tuple[int, int] | None = None
    ) -> dict[str, Any]:
        async_session = get_sessionmaker()
        async with async_session() as session:
            result = await session.execute(
                select(Character).where(
                    Character.novel_id == UUID(novel_id),
                    Character.name == character_name,
                )
            )
            character = result.scalar_one_or_none()
            if not character:
                raise LookupError("Character not found")
            timeline = character.timeline
            if chapter_range:
                timeline = [
                    item
                    for item in timeline
                    if chapter_range[0] <= int(item.get("chapter_num", 0)) <= chapter_range[1]
                ]
            return {
                "name": character.name,
                "role": character.role,
                "arc_description": character.arc_description,
                "timeline": timeline,
            }

    async def foreshadowing_lookup(self, novel_id: str, chapter_num: int) -> list[dict[str, Any]]:
        async_session = get_sessionmaker()
        async with async_session() as session:
            novel = await session.get(Novel, UUID(novel_id))
            if not novel:
                raise LookupError("Novel not found")
            matches: list[dict[str, Any]] = []
            for item in novel.foreshadowing:
                setup_chapter = item.get("setup_chapter")
                payoff_chapter = item.get("payoff_chapter")
                if setup_chapter == chapter_num or payoff_chapter == chapter_num:
                    matches.append(item)
            return matches


novel_context_service = NovelContextService()
