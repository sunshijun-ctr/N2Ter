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

        preprocess_response = client.post(f"/api/novels/{novel['id']}/preprocess")
        assert preprocess_response.status_code == 202, preprocess_response.text
        task_id = preprocess_response.json()["task_id"]

        task_response = client.get(f"/api/tasks/{task_id}")
        assert task_response.status_code == 200, task_response.text
        assert task_response.json()["status"] == "done"
        assert task_response.json()["progress"] == 100

        progress_response = client.get(f"/api/novels/{novel['id']}/progress")
        assert progress_response.status_code == 200, progress_response.text
        assert [event["event_type"] for event in progress_response.json()] == [
            "preprocess_started",
            "split_completed",
            "chapters_started",
            "chapter_done",
            "preprocess_done",
        ]
        refreshed_novel_response = client.get(f"/api/novels/{novel['id']}")
        assert refreshed_novel_response.status_code == 200, refreshed_novel_response.text
        assert refreshed_novel_response.json()["status"] == "ready_for_planning"
        refreshed_chapter_response = client.get(f"/api/novels/{novel['id']}/chapters/1")
        assert refreshed_chapter_response.status_code == 200, refreshed_chapter_response.text
        assert refreshed_chapter_response.json()["summary"]
        scenes_response = client.get(f"/api/novels/{novel['id']}/scenes")
        assert scenes_response.status_code == 200, scenes_response.text
        assert scenes_response.json()[0]["description"]

        plan_response = client.post(
            f"/api/novels/{novel['id']}/adaptation-plan",
            json={"chapters_per_episode": 2},
        )
        assert plan_response.status_code == 200, plan_response.text
        assert plan_response.json()["episode_count"] == 1

        screenplay_response = client.post(
            "/api/screenplays",
            json={
                "novel_id": novel["id"],
                "schema_type": "screenwriter",
                "title": "测试剧本",
            },
        )
        assert screenplay_response.status_code == 201, screenplay_response.text
        screenplay = screenplay_response.json()
        assert screenplay["title"] == "测试剧本"
        assert screenplay["adaptation_plan"]["episode_count"] == 1

        episodes_response = client.get(f"/api/screenplays/{screenplay['id']}/episodes")
        assert episodes_response.status_code == 200, episodes_response.text
        episodes = episodes_response.json()
        assert len(episodes) == 1
        assert episodes[0]["episode_num"] == 1
        assert episodes[0]["source_chapters"] == [1]

        generate_response = client.post(f"/api/episodes/{episodes[0]['id']}/generate")
        assert generate_response.status_code == 200, generate_response.text
        generate_task_id = generate_response.json()["task_id"]

        generated_episode_response = client.get(f"/api/episodes/{episodes[0]['id']}")
        assert generated_episode_response.status_code == 200, generated_episode_response.text
        generated_episode = generated_episode_response.json()
        assert generated_episode["status"] == "done"
        assert generated_episode["content"]["schema_type"] == "screenwriter"
        assert generated_episode["content"]["scenes"]

        generation_task_response = client.get(f"/api/tasks/{generate_task_id}")
        assert generation_task_response.status_code == 200, generation_task_response.text
        assert generation_task_response.json()["status"] == "done"

        versions_response = client.get(f"/api/episodes/{episodes[0]['id']}/versions")
        assert versions_response.status_code == 200, versions_response.text
        versions = versions_response.json()
        assert versions[0]["version"] == 1
        assert versions[0]["modified_by"] == "ai"

        patch_response = client.post(
            f"/api/episodes/{episodes[0]['id']}/patch",
            json={"instruction": "增加悬念"},
        )
        assert patch_response.status_code == 200, patch_response.text
        assert patch_response.json()["content"]["revision_notes"][0]["instruction"] == "增加悬念"

        patched_versions_response = client.get(f"/api/episodes/{episodes[0]['id']}/versions")
        assert patched_versions_response.status_code == 200, patched_versions_response.text
        assert patched_versions_response.json()[0]["version"] == 2

        restore_response = client.post(f"/api/episodes/{episodes[0]['id']}/versions/1/restore")
        assert restore_response.status_code == 200, restore_response.text
        assert "revision_notes" not in restore_response.json()["content"]

        conversation_response = client.post(
            "/api/conversations",
            json={"novel_id": novel["id"], "screenplay_id": screenplay["id"], "title": "测试对话"},
        )
        assert conversation_response.status_code == 201, conversation_response.text
        conversation = conversation_response.json()

        message_response = client.post(
            f"/api/conversations/{conversation['id']}/messages",
            json={"role": "user", "content": "请优化第一集节奏", "is_pinned": True},
        )
        assert message_response.status_code == 201, message_response.text
        assert message_response.json()["is_pinned"] is True

        messages_response = client.get(f"/api/conversations/{conversation['id']}/messages")
        assert messages_response.status_code == 200, messages_response.text
        assert messages_response.json()[0]["content"] == "请优化第一集节奏"

        export_response = client.post(
            f"/api/screenplays/{screenplay['id']}/export",
            json={"export_format": "yaml"},
        )
        assert export_response.status_code == 202, export_response.text
        export = export_response.json()
        assert export["status"] == "done"
        assert export["file_url"].endswith(".yaml")

        download_response = client.get(f"/api/exports/{export['id']}/download")
        assert download_response.status_code == 200, download_response.text
        assert "schema_type: screenwriter" in download_response.text


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

        plan_response = client.post(
            f"/api/novels/{novel['id']}/adaptation-plan",
            json={"chapters_per_episode": 1},
        )
        assert plan_response.status_code == 200, plan_response.text
        plan = plan_response.json()
        assert plan["episode_count"] == 2
        assert plan["episodes"][0]["source_chapters"] == [1]


def test_conversation_compression_preserves_pins_and_recent_messages() -> None:
    with TestClient(app) as client:
        novel_response = client.post(
            "/api/novels",
            json={"title": "Compression Novel", "content": "Body", "genres": ["test"]},
        )
        assert novel_response.status_code == 201, novel_response.text
        novel = novel_response.json()

        conversation_response = client.post(
            "/api/conversations",
            json={"novel_id": novel["id"], "title": "Compression Chat"},
        )
        assert conversation_response.status_code == 201, conversation_response.text
        conversation = conversation_response.json()

        created_messages = []
        for index, payload in enumerate(
            [
                {"role": "user", "content": "old user note"},
                {"role": "assistant", "content": "pinned decision", "is_pinned": True},
                {"role": "user", "content": "middle request"},
                {"role": "assistant", "content": "middle answer"},
                {"role": "user", "content": "recent request"},
                {"role": "assistant", "content": "recent answer"},
            ]
        ):
            response = client.post(
                f"/api/conversations/{conversation['id']}/messages",
                json=payload,
            )
            assert response.status_code == 201, response.text
            created_messages.append(response.json())

        compress_response = client.post(
            f"/api/conversations/{conversation['id']}/compress",
            json={"keep_recent": 2},
        )
        assert compress_response.status_code == 200, compress_response.text
        segment = compress_response.json()
        assert segment["original_message_ids"] == [
            created_messages[0]["id"],
            created_messages[2]["id"],
            created_messages[3]["id"],
        ]
        assert "old user note" in segment["summary"]
        assert "pinned decision" not in segment["summary"]

        messages_response = client.get(f"/api/conversations/{conversation['id']}/messages")
        assert messages_response.status_code == 200, messages_response.text
        messages = messages_response.json()
        assert [message["is_compressed"] for message in messages] == [
            True,
            False,
            True,
            True,
            False,
            False,
        ]
        assert messages[1]["is_pinned"] is True

        segments_response = client.get(
            f"/api/conversations/{conversation['id']}/compressed-segments"
        )
        assert segments_response.status_code == 200, segments_response.text
        assert segments_response.json()[0]["id"] == segment["id"]


def test_websocket_persists_conversation_messages() -> None:
    with TestClient(app) as client:
        novel_response = client.post(
            "/api/novels",
            json={"title": "对话测试小说", "content": "正文", "genres": ["都市情感"]},
        )
        assert novel_response.status_code == 201, novel_response.text
        novel = novel_response.json()
        conversation_response = client.post(
            "/api/conversations",
            json={"novel_id": novel["id"], "title": "WebSocket 对话"},
        )
        assert conversation_response.status_code == 201, conversation_response.text
        conversation = conversation_response.json()

        with client.websocket_connect(f"/ws/conversations/{conversation['id']}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "message", "content": "你好"})
            events = []
            while True:
                event = websocket.receive_json()
                events.append(event)
                if event["type"] == "message_end":
                    break

        assert any(event["type"] == "content_delta" for event in events)
        messages_response = client.get(f"/api/conversations/{conversation['id']}/messages")
        assert messages_response.status_code == 200, messages_response.text
        messages = messages_response.json()
        assert [message["role"] for message in messages] == ["user", "assistant"]
        assert messages[1]["content"] == "已收到：你好"


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
