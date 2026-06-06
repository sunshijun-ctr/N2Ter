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


def test_overview_generation_creates_overview_screenplay() -> None:
    with TestClient(app) as client:
        novel_response = client.post(
            "/api/novels",
            json={
                "title": "概览测试小说",
                "content": "第一章 风起。林晚登场。\n\n第二章 入局。沈云洲出现。",
                "genres": ["都市情感"],
            },
        )
        assert novel_response.status_code == 201, novel_response.text
        novel = novel_response.json()

        client.post(f"/api/novels/{novel['id']}/preprocess")

        overview_response = client.post(f"/api/novels/{novel['id']}/overview")
        assert overview_response.status_code == 201, overview_response.text
        overview = overview_response.json()
        assert overview["schema_type"] == "overview"
        assert overview["title"].endswith("概览版")

        screenplays_response = client.get(f"/api/novels/{novel['id']}/screenplays")
        assert screenplays_response.status_code == 200, screenplays_response.text
        assert any(item["schema_type"] == "overview" for item in screenplays_response.json())

        episodes_response = client.get(f"/api/screenplays/{overview['id']}/episodes")
        assert episodes_response.status_code == 200, episodes_response.text
        episodes = episodes_response.json()
        assert len(episodes) == 1
        document = episodes[0]["content"]
        assert document["schema_type"] == "overview"
        assert document["schema_version"] == "overview-1.0"
        assert "episodes" in document


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


class _FakeAsyncResult:
    id = "celery-test-id"


def test_preprocess_dispatches_to_celery_when_async(monkeypatch) -> None:
    from app.core import get_settings
    from app.workers import tasks as worker_tasks

    captured: dict = {}

    def fake_delay(novel_id, task_id):
        captured["args"] = (novel_id, task_id)
        return _FakeAsyncResult()

    monkeypatch.setattr(get_settings(), "async_tasks_enabled", True)
    monkeypatch.setattr(worker_tasks.preprocess_novel, "delay", fake_delay)

    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "异步小说", "content": "第一章 起。", "genres": ["都市情感"]},
        ).json()

        response = client.post(f"/api/novels/{novel['id']}/preprocess")
        assert response.status_code == 202, response.text
        body = response.json()
        assert body["status"] == "pending"

        # Dispatched, not executed in-request.
        assert captured["args"][0] == novel["id"]
        assert captured["args"][1] == body["task_id"]

        task = client.get(f"/api/tasks/{body['task_id']}").json()
        assert task["status"] == "pending"
        assert task["celery_id"] == "celery-test-id"

        refreshed = client.get(f"/api/novels/{novel['id']}").json()
        assert refreshed["status"] == "preprocessing"
        # No preprocess_done event yet (worker would emit it later).
        events = client.get(f"/api/novels/{novel['id']}/progress").json()
        assert all(e["event_type"] != "preprocess_done" for e in events)


def test_generate_dispatches_to_celery_when_async(monkeypatch) -> None:
    from app.core import get_settings
    from app.workers import tasks as worker_tasks

    captured: dict = {}

    def fake_delay(episode_id, task_id):
        captured["args"] = (episode_id, task_id)
        return _FakeAsyncResult()

    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "异步生成", "content": "第一章 起。", "genres": ["都市情感"]},
        ).json()
        client.post(f"/api/novels/{novel['id']}/preprocess")  # sync, async still off
        screenplay = client.post(
            "/api/screenplays",
            json={"novel_id": novel["id"], "schema_type": "screenwriter"},
        ).json()
        episode = client.get(f"/api/screenplays/{screenplay['id']}/episodes").json()[0]

        # Now enable async + stub the dispatch for the generate call.
        monkeypatch.setattr(get_settings(), "async_tasks_enabled", True)
        monkeypatch.setattr(worker_tasks.generate_episode, "delay", fake_delay)

        response = client.post(f"/api/episodes/{episode['id']}/generate")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "pending"
        assert captured["args"] == (episode["id"], body["task_id"])

        refreshed = client.get(f"/api/episodes/{episode['id']}").json()
        assert refreshed["status"] == "generating"


def test_message_auto_pins_key_decision() -> None:
    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "自动pin", "content": "正文", "genres": ["都市情感"]},
        ).json()
        conversation = client.post(
            "/api/conversations", json={"novel_id": novel["id"], "title": "决策对话"}
        ).json()

        pinned = client.post(
            f"/api/conversations/{conversation['id']}/messages",
            json={"role": "user", "content": "确认改编方案，定 24 集"},
        ).json()
        assert pinned["is_pinned"] is True  # auto-pinned by keyword

        normal = client.post(
            f"/api/conversations/{conversation['id']}/messages",
            json={"role": "user", "content": "这段对白再口语一点"},
        ).json()
        assert normal["is_pinned"] is False

        # An assistant message mentioning a keyword is not auto-pinned.
        assistant = client.post(
            f"/api/conversations/{conversation['id']}/messages",
            json={"role": "assistant", "content": "已按风格调整"},
        ).json()
        assert assistant["is_pinned"] is False


def test_conversation_auto_titles_after_rounds() -> None:
    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "标题小说", "content": "正文", "genres": ["都市情感"]},
        ).json()
        # Created without a title -> defaults to the placeholder "新对话".
        conversation = client.post(
            "/api/conversations", json={"novel_id": novel["id"]}
        ).json()
        assert conversation["title"] == "新对话"

        first_user_message = "帮我优化第一集的节奏感"
        for index in range(6):
            role = "user" if index % 2 == 0 else "assistant"
            content = first_user_message if index == 0 else f"第{index}轮内容"
            response = client.post(
                f"/api/conversations/{conversation['id']}/messages",
                json={"role": role, "content": content},
            )
            assert response.status_code == 201, response.text

        listed = client.get("/api/conversations").json()
        updated = next(item for item in listed if item["id"] == conversation["id"])
        # Auto-titled from the first user message (LLM disabled -> fallback).
        assert updated["title"] != "新对话"
        assert updated["title"] == first_user_message[:16]


def test_conversation_keeps_user_supplied_title() -> None:
    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "标题小说2", "content": "正文", "genres": ["都市情感"]},
        ).json()
        conversation = client.post(
            "/api/conversations",
            json={"novel_id": novel["id"], "title": "我的自定义标题"},
        ).json()
        for index in range(6):
            client.post(
                f"/api/conversations/{conversation['id']}/messages",
                json={"role": "user", "content": f"消息{index}"},
            )
        listed = client.get("/api/conversations").json()
        updated = next(item for item in listed if item["id"] == conversation["id"])
        assert updated["title"] == "我的自定义标题"  # not overwritten


def test_conversation_auto_compresses_over_token_threshold(monkeypatch) -> None:
    from app.core import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "context_window_tokens", 10)  # threshold = 6 tokens
    monkeypatch.setattr(settings, "compression_keep_recent", 2)

    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "自动压缩", "content": "正文", "genres": ["都市情感"]},
        ).json()
        conversation = client.post(
            "/api/conversations",
            json={"novel_id": novel["id"], "title": "长对话"},
        ).json()

        for index in range(5):
            response = client.post(
                f"/api/conversations/{conversation['id']}/messages",
                json={"role": "user", "content": f"这是第{index}条较长的中文消息内容"},
            )
            assert response.status_code == 201, response.text

        segments = client.get(
            f"/api/conversations/{conversation['id']}/compressed-segments"
        ).json()
        assert segments, "auto-compression should have produced a segment"

        messages = client.get(
            f"/api/conversations/{conversation['id']}/messages"
        ).json()
        assert any(message["is_compressed"] for message in messages)
        # The two most recent messages stay verbatim (keep_recent=2).
        assert messages[-1]["is_compressed"] is False
        assert messages[-2]["is_compressed"] is False


def test_pdf_and_zip_export() -> None:
    from app.exporters.pdf_exporter import pdf_exporter

    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "导出小说", "content": "第一章 起。冲突开始。", "genres": ["都市情感"]},
        ).json()
        client.post(f"/api/novels/{novel['id']}/preprocess")
        client.post(
            f"/api/novels/{novel['id']}/adaptation-plan", json={"chapters_per_episode": 1}
        )
        screenplay = client.post(
            "/api/screenplays",
            json={"novel_id": novel["id"], "schema_type": "screenwriter", "title": "导出剧本"},
        ).json()
        episode = client.get(f"/api/screenplays/{screenplay['id']}/episodes").json()[0]
        client.post(f"/api/episodes/{episode['id']}/generate")

        # ZIP always works (YAML inside; PDF best-effort).
        zip_export = client.post(
            f"/api/screenplays/{screenplay['id']}/export", json={"export_format": "zip"}
        ).json()
        assert zip_export["status"] == "done", zip_export
        assert zip_export["file_url"].endswith(".zip")
        zip_download = client.get(f"/api/exports/{zip_export['id']}/download")
        assert zip_download.status_code == 200
        assert zip_download.content[:2] == b"PK"  # zip magic

        if not pdf_exporter.available():
            pytest.skip("WeasyPrint native libraries unavailable; skipping PDF render")

        pdf_export = client.post(
            f"/api/screenplays/{screenplay['id']}/export", json={"export_format": "pdf"}
        ).json()
        assert pdf_export["status"] == "done", pdf_export
        assert pdf_export["file_url"].endswith(".pdf")
        pdf_download = client.get(f"/api/exports/{pdf_export['id']}/download")
        assert pdf_download.status_code == 200
        assert pdf_download.content[:5] == b"%PDF-"


def test_export_dispatches_to_celery_when_async(monkeypatch) -> None:
    from app.core import get_settings
    from app.workers import tasks as worker_tasks

    captured: dict = {}

    def fake_delay(export_id):
        captured["export_id"] = export_id
        return _FakeAsyncResult()

    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "异步导出", "content": "第一章 起。", "genres": ["都市情感"]},
        ).json()
        client.post(f"/api/novels/{novel['id']}/preprocess")
        screenplay = client.post(
            "/api/screenplays",
            json={"novel_id": novel["id"], "schema_type": "screenwriter"},
        ).json()

        monkeypatch.setattr(get_settings(), "async_tasks_enabled", True)
        monkeypatch.setattr(worker_tasks.export_screenplay, "delay", fake_delay)

        response = client.post(
            f"/api/screenplays/{screenplay['id']}/export", json={"export_format": "yaml"}
        )
        assert response.status_code == 202, response.text
        export = response.json()
        assert export["status"] == "pending"
        assert export["file_url"] is None
        assert captured["export_id"] == export["id"]

        # Not rendered in-request.
        fetched = client.get(f"/api/exports/{export['id']}").json()
        assert fetched["status"] == "pending"


def test_novel_progress_websocket_replays_events() -> None:
    with TestClient(app) as client:
        novel = client.post(
            "/api/novels",
            json={"title": "进度小说", "content": "第一章 起。", "genres": ["都市情感"]},
        ).json()
        client.post(f"/api/novels/{novel['id']}/preprocess")  # sync -> emits full set

        with client.websocket_connect(f"/ws/novels/{novel['id']}/progress") as ws:
            event_types = []
            while True:
                message = ws.receive_json()
                if message["type"] == "done":
                    break
                assert message["type"] == "progress"
                event_types.append(message["event_type"])

        assert event_types[0] == "preprocess_started"
        assert event_types[-1] == "preprocess_done"


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
