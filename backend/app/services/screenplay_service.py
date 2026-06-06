from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Episode, EpisodeStatus, Screenplay


class ScreenplayService:
    async def create_episodes_from_plan(self, db: AsyncSession, screenplay: Screenplay) -> list[Episode]:
        episodes: list[Episode] = []
        plan_episodes = (screenplay.adaptation_plan or {}).get("episodes", [])
        for item in plan_episodes:
            episode_num = int(item.get("episode_num") or len(episodes) + 1)
            source_chapters = item.get("source_chapters") or item.get("chapters") or []
            episode = Episode(
                screenplay_id=screenplay.id,
                episode_num=episode_num,
                title=item.get("title") or f"第 {episode_num} 集",
                source_chapters=[int(chapter) for chapter in source_chapters],
                status=EpisodeStatus.pending,
                content={},
            )
            db.add(episode)
            episodes.append(episode)
        await db.flush()
        return episodes


screenplay_service = ScreenplayService()
