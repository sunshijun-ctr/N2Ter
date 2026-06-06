from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Chapter,
    Episode,
    EpisodeStatus,
    SceneInNovel,
    Screenplay,
    ScreenplayStatus,
    Task,
    TaskStatus,
    TaskType,
)
from app.services.task_service import task_service
from app.services.episode_service import episode_service


class GenerationService:
    async def generate_episode_fallback(
        self,
        db: AsyncSession,
        episode: Episode,
    ) -> tuple[Episode, Task]:
        screenplay = await db.get(Screenplay, episode.screenplay_id)
        if not screenplay:
            raise LookupError("Screenplay not found")

        task = await task_service.create_task(
            db,
            task_type=TaskType.generate_episode,
            episode_id=episode.id,
            status=TaskStatus.running,
            progress=10,
        )
        await task_service.record_progress(
            db,
            screenplay.novel_id,
            "episode_generation_started",
            {"task_id": str(task.id), "episode_id": str(episode.id)},
        )

        content = await self.build_screenwriter_episode(db, screenplay, episode)
        episode.content = content
        episode.status = EpisodeStatus.done
        episode.generated_at = datetime.now(timezone.utc)

        await episode_service.save_version(db, episode, content, modified_by="ai")

        task.status = TaskStatus.done
        task.progress = 100
        screenplay.status = ScreenplayStatus.generating
        await task_service.record_progress(
            db,
            screenplay.novel_id,
            "episode_generated",
            {"episode_id": str(episode.id), "episode_num": episode.episode_num},
        )
        await db.commit()
        await db.refresh(episode)
        await db.refresh(task)
        return episode, task

    async def build_screenwriter_episode(
        self, db: AsyncSession, screenplay: Screenplay, episode: Episode
    ) -> dict:
        chapters_result = await db.execute(
            select(Chapter)
            .where(
                Chapter.novel_id == screenplay.novel_id,
                Chapter.chapter_num.in_(episode.source_chapters or []),
            )
            .order_by(Chapter.chapter_num.asc())
        )
        chapters = list(chapters_result.scalars())
        scenes_result = await db.execute(
            select(SceneInNovel, Chapter.chapter_num)
            .join(Chapter, Chapter.id == SceneInNovel.chapter_id)
            .where(
                SceneInNovel.novel_id == screenplay.novel_id,
                Chapter.chapter_num.in_(episode.source_chapters or []),
            )
            .order_by(Chapter.chapter_num.asc(), SceneInNovel.scene_index.asc())
        )
        scene_rows = list(scenes_result)
        scenes = [
            {
                "scene_number": index,
                "slug_line": "内景/外景 - 待定 - 待定",
                "source_chapter": chapter_num,
                "scene_objective": scene.description or "承接原著情节",
                "action_description": scene.content,
                "characters_present": scene.characters,
                "dialogues": [],
                "rewrite_notes": "fallback 初稿：需由生成 agent 或编剧进一步打磨。",
            }
            for index, (scene, chapter_num) in enumerate(scene_rows, start=1)
        ]
        return {
            "schema_version": f"{screenplay.schema_type.value}-1.0",
            "schema_type": screenplay.schema_type.value,
            "episode_number": episode.episode_num,
            "title": episode.title or f"第 {episode.episode_num} 集",
            "source_chapter": ",".join(str(num) for num in episode.source_chapters or []),
            "episode_summary": "\n".join(chapter.summary or chapter.title for chapter in chapters),
            "key_conflict": "待生成",
            "emotional_arc": "待生成",
            "scenes": scenes,
        }

generation_service = GenerationService()
