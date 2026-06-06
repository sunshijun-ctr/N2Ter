import asyncio
import json

import asyncpg
import pytest

from app.core import get_settings
from app.tools.base import ToolContext
from app.tools.registry import tool_registry


pytestmark = pytest.mark.integration


def test_registered_context_tools_query_database() -> None:
    asyncio.run(_assert_registered_context_tools_query_database())


async def _assert_registered_context_tools_query_database() -> None:
    novel_id = await _seed_context_data()
    context = ToolContext(novel_id=novel_id)
    chapter_result = await tool_registry.get("chapter_get").run(
        {"chapter_num": 1, "mode": "full"}, context
    )
    assert chapter_result.status == "success"
    assert "玉佩" in chapter_result.data["content"]

    search_result = await tool_registry.get("chapter_search").run({"query": "玉佩", "top_k": 3}, context)
    assert search_result.status == "success"
    assert search_result.data[0]["chapter_num"] == 1

    character_result = await tool_registry.get("character_timeline").run({"character_name": "林晚"}, context)
    assert character_result.status == "success"
    assert character_result.data["timeline"][0]["event"] == "收到玉佩"

    foreshadowing_result = await tool_registry.get("foreshadowing_lookup").run({"chapter_num": 1}, context)
    assert foreshadowing_result.status == "success"
    assert foreshadowing_result.data[0]["setup"] == "玉佩发光"


async def _seed_context_data() -> str:
    dsn = get_settings().database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)
    await conn.execute(
        """
        TRUNCATE
            exports,
            progress_events,
            tasks,
            compressed_segments,
            messages,
            conversations,
            episode_versions,
            episodes,
            screenplays,
            characters,
            scenes_in_novel,
            chapters,
            novels
        RESTART IDENTITY CASCADE;
        """
    )
    novel_id = await conn.fetchval(
        """
        INSERT INTO novels (title, original_text_url, foreshadowing)
        VALUES ('工具测试小说', 'novels/tool-test.txt', $1::jsonb)
        RETURNING id;
        """,
        json.dumps([{"setup_chapter": 1, "payoff_chapter": 2, "setup": "玉佩发光"}]),
    )
    chapter_id = await conn.fetchval(
        """
        INSERT INTO chapters (novel_id, chapter_num, title, content, word_count)
        VALUES ($1, 1, '第一章 风起', '林晚收到一枚玉佩。', 10)
        RETURNING id;
        """,
        novel_id,
    )
    await conn.execute(
        """
        INSERT INTO scenes_in_novel (novel_id, chapter_id, scene_index, content, description, characters)
        VALUES ($1, $2, 1, '林晚收到一枚玉佩。', '玉佩登场', $3::jsonb);
        """,
        novel_id,
        chapter_id,
        json.dumps(["林晚"]),
    )
    await conn.execute(
        """
        INSERT INTO characters (novel_id, name, role, arc_description, timeline)
        VALUES ($1, '林晚', 'protagonist', '从逃避到承担', $2::jsonb);
        """,
        novel_id,
        json.dumps([{"chapter_num": 1, "event": "收到玉佩"}]),
    )
    await conn.close()
    return str(novel_id)
