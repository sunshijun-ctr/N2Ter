from __future__ import annotations

from typing import Any

from app.models import Screenplay


def default_screenplay_memory() -> dict[str, Any]:
    return {
        "generated_episodes": [],
        "global_style_notes": [],
        "current_character_states": [],
        "unresolved_foreshadowing": [],
        "continuity_constraints": [],
        "last_updated_episode": None,
    }


class ScreenplayMemoryService:
    def get_memory(self, screenplay: Screenplay) -> dict[str, Any]:
        memory = dict(screenplay.screenplay_memory or {})
        base = default_screenplay_memory()
        return {**base, **memory}

    def get_memory_for_prompt(
        self, screenplay: Screenplay, *, window: int = 4
    ) -> dict[str, Any]:
        """Capped view for prompts: keep the most recent ``window`` episodes in
        full and roll older ones into a compact digest string. Prevents context
        from ballooning as episode count grows toward 20+."""
        memory = self.get_memory(screenplay)
        episodes = memory.get("generated_episodes") or []
        if len(episodes) <= window:
            return memory
        recent = episodes[-window:]
        older = episodes[:-window]
        digest = "；".join(
            f"第{item.get('episode_num')}集：{str(item.get('summary') or '')[:60]}"
            for item in older
        )
        return {**memory, "generated_episodes": recent, "earlier_episodes_digest": digest}

    def apply_patch(self, screenplay: Screenplay, patch: dict[str, Any] | None) -> dict[str, Any]:
        memory = self.get_memory(screenplay)
        if not patch:
            screenplay.screenplay_memory = memory
            return memory

        episode_num = patch.get("episode_num")
        if episode_num is not None:
            episodes = [
                item
                for item in memory.get("generated_episodes", [])
                if item.get("episode_num") != episode_num
            ]
            episodes.append(patch)
            episodes.sort(key=lambda item: item.get("episode_num") or 0)
            memory["generated_episodes"] = episodes
            memory["last_updated_episode"] = episode_num

        for key in (
            "global_style_notes",
            "current_character_states",
            "unresolved_foreshadowing",
            "continuity_constraints",
        ):
            if key in patch:
                memory[key] = patch[key]

        screenplay.screenplay_memory = memory
        return memory


screenplay_memory_service = ScreenplayMemoryService()
