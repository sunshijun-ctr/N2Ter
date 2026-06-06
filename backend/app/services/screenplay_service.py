import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Episode, EpisodeStatus, Screenplay, ScreenplayStatus

_CHAPTER_REF = re.compile(r"第\s*(\d+)\s*章")


def _as_chapter_nums(raw) -> list[int]:
    """Coerce a plan's ``source_chapters`` into integer chapter numbers.

    Entries may be ints, digit strings, or free-text chapter references carried
    over from the overview document (e.g. ``"第1章 正文前言, 第3章 人生总有惊喜"``).
    We extract every ``第N章`` number from such strings so episodes still get a
    usable chapter range to generate from. Order is preserved, duplicates dropped.
    """
    nums: list[int] = []
    for chapter in raw or []:
        if isinstance(chapter, bool):
            continue
        if isinstance(chapter, int):
            nums.append(chapter)
        elif isinstance(chapter, str):
            matches = _CHAPTER_REF.findall(chapter)
            if not matches and chapter.strip().isdigit():
                matches = [chapter.strip()]
            nums.extend(int(m) for m in matches)
    seen: set[int] = set()
    return [n for n in nums if not (n in seen or seen.add(n))]


class ScreenplayService:
    async def create_episodes_from_plan(self, db: AsyncSession, screenplay: Screenplay) -> list[Episode]:
        episodes: list[Episode] = []
        plan_episodes = (screenplay.adaptation_plan or {}).get("episodes", [])
        for item in plan_episodes:
            try:
                episode_num = int(item.get("episode_num") or len(episodes) + 1)
            except (TypeError, ValueError):
                episode_num = len(episodes) + 1
            source_chapters = _as_chapter_nums(
                item.get("source_chapters") or item.get("chapters") or []
            )
            if not source_chapters:
                continue
            episode = Episode(
                screenplay_id=screenplay.id,
                episode_num=episode_num,
                title=item.get("title") or f"第 {episode_num} 集",
                source_chapters=source_chapters,
                status=EpisodeStatus.pending,
                content={},
            )
            db.add(episode)
            episodes.append(episode)
        await db.flush()
        return episodes

    async def create_branch(
        self,
        db: AsyncSession,
        source: Screenplay,
        *,
        branch_name: str | None,
        regeneration_instruction: str,
        adaptation_plan: dict | None = None,
        plan_source: str = "user_adjusted",
    ) -> Screenplay:
        branch_title = branch_name or f"{source.title or '剧本'} 分支"
        branch = Screenplay(
            user_id=source.user_id,
            novel_id=source.novel_id,
            parent_screenplay_id=source.id,
            schema_type=source.schema_type,
            schema_version=source.schema_version,
            adaptation_plan=adaptation_plan or source.adaptation_plan or {},
            style_preferences={**(source.style_preferences or {}), "title": branch_title},
            screenplay_memory={},
            branch_name=branch_name,
            branch_type="regenerated",
            regeneration_instruction=regeneration_instruction,
            plan_source=plan_source,
            status=ScreenplayStatus.planning,
        )
        db.add(branch)
        await db.flush()
        await self.create_episodes_from_plan(db, branch)
        return branch


screenplay_service = ScreenplayService()
