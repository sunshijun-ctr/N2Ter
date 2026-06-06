from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Episode, EpisodeStatus, EpisodeVersion


class EpisodeService:
    async def next_version(self, db: AsyncSession, episode_id: UUID) -> int:
        result = await db.execute(
            select(func.max(EpisodeVersion.version)).where(EpisodeVersion.episode_id == episode_id)
        )
        current = result.scalar_one_or_none() or 0
        return int(current) + 1

    async def save_version(
        self,
        db: AsyncSession,
        episode: Episode,
        content: dict[str, Any],
        modified_by: str = "user",
    ) -> EpisodeVersion:
        version = EpisodeVersion(
            episode_id=episode.id,
            version=await self.next_version(db, episode.id),
            content=content,
            modified_by=modified_by,
        )
        db.add(version)
        await db.flush()
        return version

    async def patch_episode(
        self,
        db: AsyncSession,
        episode: Episode,
        instruction: str,
        modified_by: str = "ai",
    ) -> Episode:
        content = dict(episode.content or {})
        notes = list(content.get("revision_notes") or [])
        notes.append({"instruction": instruction, "modified_by": modified_by})
        content["revision_notes"] = notes
        episode.content = content
        episode.status = EpisodeStatus.done
        await self.save_version(db, episode, content, modified_by=modified_by)
        await db.commit()
        await db.refresh(episode)
        return episode

    async def list_versions(self, db: AsyncSession, episode_id: UUID) -> list[EpisodeVersion]:
        result = await db.execute(
            select(EpisodeVersion)
            .where(EpisodeVersion.episode_id == episode_id)
            .order_by(EpisodeVersion.version.desc())
        )
        return list(result.scalars())

    async def restore_version(
        self,
        db: AsyncSession,
        episode: Episode,
        version_num: int,
    ) -> Episode:
        result = await db.execute(
            select(EpisodeVersion).where(
                EpisodeVersion.episode_id == episode.id,
                EpisodeVersion.version == version_num,
            )
        )
        version = result.scalar_one_or_none()
        if not version:
            raise LookupError("Episode version not found")
        episode.content = version.content
        episode.status = EpisodeStatus.done
        await self.save_version(db, episode, version.content, modified_by="user")
        await db.commit()
        await db.refresh(episode)
        return episode


episode_service = EpisodeService()
