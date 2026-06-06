from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Episode, EpisodeStatus, Screenplay


def _as_chapter_nums(raw) -> list[int]:
    """Coerce a plan's ``source_chapters`` to integer chapter numbers, skipping
    anything that isn't numeric (e.g. chapter-title strings carried over from the
    overview document) instead of raising and 500-ing the request."""
    nums: list[int] = []
    for chapter in raw or []:
        try:
            nums.append(int(chapter))
        except (TypeError, ValueError):
            continue
    return nums


class ScreenplayService:
    async def create_episodes_from_plan(self, db: AsyncSession, screenplay: Screenplay) -> list[Episode]:
        episodes: list[Episode] = []
        plan_episodes = (screenplay.adaptation_plan or {}).get("episodes", [])
        for item in plan_episodes:
            try:
                episode_num = int(item.get("episode_num") or len(episodes) + 1)
            except (TypeError, ValueError):
                episode_num = len(episodes) + 1
            source_chapters = item.get("source_chapters") or item.get("chapters") or []
            episode = Episode(
                screenplay_id=screenplay.id,
                episode_num=episode_num,
                title=item.get("title") or f"第 {episode_num} 集",
                source_chapters=_as_chapter_nums(source_chapters),
                status=EpisodeStatus.pending,
                content={},
            )
            db.add(episode)
            episodes.append(episode)
        await db.flush()
        return episodes


screenplay_service = ScreenplayService()
