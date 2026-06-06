import asyncio

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app.core import get_settings
from app.main import app


pytestmark = pytest.mark.integration


def test_basic_authoring_flow_against_database() -> None:
    with TestClient(app) as client:
        novel_response = client.post(
            "/api/novels",
            json={
                "title": "测试小说",
                "author": "匿名作者",
                "content": "第一章 风起。人物登场，冲突开始。",
                "genres": ["都市情感"],
            },
        )
        assert novel_response.status_code == 201, novel_response.text
        novel = novel_response.json()

        chapters_response = client.get(f"/api/novels/{novel['id']}/chapters")
        assert chapters_response.status_code == 200, chapters_response.text
        chapters = chapters_response.json()
        assert len(chapters) == 1
        assert chapters[0]["title"] == "正文"

        screenplay_response = client.post(
            "/api/screenplays",
            json={
                "novel_id": novel["id"],
                "schema_type": "screenwriter",
                "title": "测试剧本",
                "adaptation_plan": {"episodes": [{"episode_num": 1, "chapters": [1]}]},
            },
        )
        assert screenplay_response.status_code == 201, screenplay_response.text
        screenplay = screenplay_response.json()
        assert screenplay["title"] == "测试剧本"

        episode_response = client.post(f"/api/screenplays/{screenplay['id']}/episodes")
        assert episode_response.status_code == 201, episode_response.text
        episode = episode_response.json()
        assert episode["episode_num"] == 1

        conversation_response = client.post(
            "/api/conversations",
            json={"novel_id": novel["id"], "screenplay_id": screenplay["id"], "title": "测试对话"},
        )
        assert conversation_response.status_code == 201, conversation_response.text

        export_response = client.post(
            f"/api/screenplays/{screenplay['id']}/export",
            json={"export_format": "yaml"},
        )
        assert export_response.status_code == 202, export_response.text
        assert export_response.json()["status"] == "pending"


def test_upload_splits_chapter_headings() -> None:
    content = """
第一章 风起
林晚第一次看见那封信。

第二章 入局
她决定去见沈云洲。
""".strip()

    with TestClient(app) as client:
        novel_response = client.post(
            "/api/novels",
            json={"title": "双章小说", "content": content, "genres": ["悬疑推理"]},
        )
        assert novel_response.status_code == 201, novel_response.text
        novel = novel_response.json()

        chapters_response = client.get(f"/api/novels/{novel['id']}/chapters")
        assert chapters_response.status_code == 200, chapters_response.text
        chapters = chapters_response.json()
        assert [chapter["title"] for chapter in chapters] == ["第一章 风起", "第二章 入局"]

        chapter_response = client.get(f"/api/novels/{novel['id']}/chapters/2")
        assert chapter_response.status_code == 200, chapter_response.text
        assert "沈云洲" in chapter_response.json()["content"]


@pytest.fixture(autouse=True)
def clean_database():
    asyncio.run(_clean_database())
    yield


async def _clean_database() -> None:
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
    await conn.close()
