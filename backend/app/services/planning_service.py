from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chapter, Novel


class PlanningService:
    async def build_default_plan(
        self,
        db: AsyncSession,
        novel: Novel,
        chapters_per_episode: int = 2,
    ) -> dict:
        result = await db.execute(
            select(Chapter)
            .where(Chapter.novel_id == novel.id)
            .order_by(Chapter.chapter_num.asc())
        )
        chapters = list(result.scalars())
        if not chapters:
            return {
                "novel_id": str(novel.id),
                "title": f"{novel.title} 默认改编方案",
                "episode_count": 0,
                "chapters_per_episode": chapters_per_episode,
                "episodes": [],
            }

        episodes = []
        for index in range(0, len(chapters), chapters_per_episode):
            group = chapters[index : index + chapters_per_episode]
            episode_num = len(episodes) + 1
            source_chapters = [chapter.chapter_num for chapter in group]
            episodes.append(
                {
                    "episode_num": episode_num,
                    "title": f"第 {episode_num} 集",
                    "source_chapters": source_chapters,
                    "source_chapter_titles": [chapter.title for chapter in group],
                    "summary": self._episode_summary(group),
                    "key_conflict": "待生成",
                }
            )

        return {
            "novel_id": str(novel.id),
            "title": f"{novel.title} 默认改编方案",
            "episode_count": len(episodes),
            "chapters_per_episode": chapters_per_episode,
            "episodes": episodes,
        }

    async def build_default_plan_by_novel_id(
        self,
        db: AsyncSession,
        novel_id: UUID,
        chapters_per_episode: int = 2,
    ) -> dict:
        novel = await db.get(Novel, novel_id)
        if not novel:
            raise LookupError("Novel not found")
        return await self.build_default_plan(db, novel, chapters_per_episode)

    def _episode_summary(self, chapters: list[Chapter]) -> str:
        summaries = [chapter.summary for chapter in chapters if chapter.summary]
        if summaries:
            return "\n".join(summaries)[:300]
        titles = "、".join(chapter.title for chapter in chapters)
        return f"覆盖章节：{titles}"


planning_service = PlanningService()
