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
