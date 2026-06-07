"""Unit tests for the LLM / embedding / rerank / generation building blocks.

These run fully offline: they exercise the deterministic fallback behaviour and
the pure helpers, and use monkeypatching to verify the "enabled" code paths
without any real network calls or database.
"""

import asyncio

import pytest

from app.agents import ConversationAgent
from app.models import SchemaType
from app.tools.base import ToolContext
from app.tools.registry import tool_registry
from app.services.embedding_service import embedding_service
from app.services.generation_service import generation_service
from app.services.llm_service import LLMError, LLMService, _extract_json
from app.services.preprocessing_service import preprocessing_service
from app.services.rerank_service import RerankService
from app.services.vector_store_service import vector_store_service


# --------------------------------------------------------------------- LLM
def test_extract_json_handles_fenced_and_embedded() -> None:
    assert _extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _extract_json('noise {"b": 2} trailing') == {"b": 2}


def test_llm_disabled_returns_stub_contract(monkeypatch) -> None:
    service = LLMService()
    monkeypatch.setattr(service._settings, "llm_api_key", "")  # force disabled
    assert service.enabled is False
    result = asyncio.run(service.generate_json("system", {"z": 1, "a": 2}))
    assert result["status"] == "stub"
    assert result["payload_keys"] == ["a", "z"]


def test_llm_disabled_stream_chat_echoes(monkeypatch) -> None:
    service = LLMService()
    monkeypatch.setattr(service._settings, "llm_api_key", "")  # force disabled

    async def collect() -> list[str]:
        return [chunk async for chunk in service.stream_chat("你好")]

    assert "".join(asyncio.run(collect())) == "已收到：你好"


def test_llm_structured_parses_chat_output(monkeypatch) -> None:
    service = LLMService()
    monkeypatch.setattr(service._settings, "llm_api_key", "test-key")
    assert service.enabled is True

    async def fake_chat(messages, **kwargs):
        assert kwargs.get("json_mode") is True
        return '{"summary": "ok"}'

    monkeypatch.setattr(service, "_chat", fake_chat)
    result = asyncio.run(service.generate_structured(system="s", user="u"))
    assert result == {"summary": "ok"}


def test_llm_structured_raises_on_bad_json(monkeypatch) -> None:
    service = LLMService()
    monkeypatch.setattr(service._settings, "llm_api_key", "test-key")

    async def fake_chat(messages, **kwargs):
        return "not json at all"

    monkeypatch.setattr(service, "_chat", fake_chat)
    with pytest.raises(LLMError):
        asyncio.run(service.generate_structured(system="s", user="u"))


# --------------------------------------------------------------- embedding
def test_embedding_fallback_is_deterministic_and_correct_dim() -> None:
    a = asyncio.run(embedding_service.embed("林黛玉葬花"))
    b = asyncio.run(embedding_service.embed("林黛玉葬花"))
    c = asyncio.run(embedding_service.embed("贾宝玉摔玉"))
    assert len(a) == embedding_service.dim
    assert a == b
    assert a != c


def test_embedding_batch_matches_single() -> None:
    batch = asyncio.run(embedding_service.embed_batch(["甲", "乙"]))
    assert len(batch) == 2
    assert batch[0] == asyncio.run(embedding_service.embed("甲"))


# ------------------------------------------------------------------ rerank
def test_rerank_passthrough_when_disabled() -> None:
    service = RerankService()
    items = [{"content": "x"}, {"content": "y"}, {"content": "z"}]
    assert service.enabled is False
    assert asyncio.run(service.rerank("q", items, top_k=2)) == items[:2]


def test_rerank_reorders_by_score(monkeypatch) -> None:
    service = RerankService()
    monkeypatch.setattr(service._settings, "rerank_url", "http://rerank.local")

    async def fake_call(query, documents):
        # Reverse preference: later docs score higher.
        return [float(i) for i in range(len(documents))]

    monkeypatch.setattr(service, "_call_api", fake_call)
    items = [{"content": "a"}, {"content": "b"}, {"content": "c"}]
    ranked = asyncio.run(service.rerank("q", items, top_k=2))
    assert [item["content"] for item in ranked] == ["c", "b"]
    assert ranked[0]["relevance_score"] == 2.0


# ------------------------------------------------------------ vector store
def test_vector_store_degrades_without_chroma() -> None:
    # chromadb is an optional dependency; query must not raise when absent.
    if vector_store_service.available:
        pytest.skip("chromadb installed; offline-degrade path not applicable")
    assert vector_store_service.query("novel-1", [0.0] * 8, top_k=5) == []
    assert vector_store_service.upsert("n", ["1"], [[0.0]], ["doc"], [{}]) is False


# ----------------------------------------------------- preprocessing utils
def test_materialise_scenes_uses_char_offsets() -> None:
    content = "第一段。第二段。第三段。"
    raw = [
        {"start_char": 0, "end_char": 4, "characters": ["甲"]},
        {"content": "独立片段", "description": "d"},
        {"start_char": 0, "end_char": 0},  # invalid -> dropped
    ]
    scenes = preprocessing_service._materialise_scenes(content, raw)
    assert scenes[0]["content"] == content[0:4]
    assert scenes[0]["characters"] == ["甲"]
    assert scenes[1]["content"] == "独立片段"
    assert len(scenes) == 2


def test_quality_level_thresholds() -> None:
    q = preprocessing_service
    assert q._quality_level(0, 100).value == "excellent"
    assert q._quality_level(10, 100).value == "good"
    assert q._quality_level(20, 100).value == "degraded"
    assert q._quality_level(50, 100).value == "poor"


def test_arc_to_text_formats_dict() -> None:
    text = preprocessing_service._arc_to_text(
        {"start": "封闭", "turning_points": ["相遇"], "end": "敞开"}
    )
    assert "起点：封闭" in text and "转折：相遇" in text and "终点：敞开" in text


# -------------------------------------------------------- generation utils
class _FakeScreenplay:
    schema_type = SchemaType.screenwriter


class _FakeEpisode:
    episode_num = 3
    source_chapters = [5, 6]
    title = None


def test_normalise_content_fills_required_keys() -> None:
    content = generation_service._normalise_content(
        {"scenes": [{"scene_number": 1}]}, _FakeScreenplay(), _FakeEpisode()
    )
    assert content["schema_type"] == "screenwriter"
    assert content["schema_version"] == "screenwriter-1.0"
    assert content["episode_number"] == 3
    assert content["source_chapter"] == "5,6"
    assert content["title"] == "第 3 集"
    assert content["scenes"]


def test_normalise_ai_video_wraps_screenwriter_scenes() -> None:
    screenplay = _FakeScreenplay()
    screenplay.schema_type = SchemaType.ai_video
    episode = _FakeEpisode()
    content = generation_service._normalise_content(
        {
            "scenes": [
                {
                    "slug_line": "内景 - 咖啡馆",
                    "action_description": "林晚独自坐着。",
                    "dialogues": [{"character": "林晚", "line": "有人吗？"}],
                }
            ]
        },
        screenplay,
        episode,
    )
    assert content["schema_type"] == "ai_video"
    shots = content["scenes"][0]["shots"]
    assert len(shots) == 1
    assert shots[0]["generation_prompt"]
    assert shots[0]["dialogue"][0]["line"] == "有人吗？"


def test_has_usable_content_ai_video_requires_shots() -> None:
    assert generation_service._has_usable_content(
        {"scenes": [{"slug_line": "x"}]}, SchemaType.ai_video
    ) is False
    assert generation_service._has_usable_content(
        {"scenes": [{"shots": [{"shot_id": "s1"}]}]}, SchemaType.ai_video
    ) is True


def test_schema_definition_loads_known_type() -> None:
    text = generation_service._schema_definition("screenwriter")
    assert "schema_type" in text
    assert generation_service._schema_definition("unknown") == ""


# ----------------------------------------------------------- token estimator
def test_estimate_tokens() -> None:
    from app.services.token_estimator import estimate_tokens

    assert estimate_tokens("") == 0
    assert estimate_tokens(None) == 0
    assert estimate_tokens("林黛玉") == 3  # CJK ~ 1 token / char
    assert estimate_tokens("abcd") == 1  # ASCII ~ 1 token / 4 chars
    assert estimate_tokens("林黛玉abcd") == 4


# ------------------------------------------------------ conversation summarizer
def test_compressor_fallback_when_llm_disabled(monkeypatch) -> None:
    from app.services import conversation_compressor as module
    from app.services.conversation_compressor import conversation_compressor

    monkeypatch.setattr(module.llm_service._settings, "llm_api_key", "")  # force disabled

    messages = [
        {"id": "m1", "role": "user", "content": "把第一集节奏放慢"},
        {"id": "m2", "role": "assistant", "content": "好的，已调整"},
    ]
    result = asyncio.run(conversation_compressor.compress(messages))
    assert result["message_count"] == 2
    assert result["original_message_ids"] == ["m1", "m2"]
    assert "把第一集节奏放慢" in result["summary"]


def test_compressor_uses_llm_when_enabled(monkeypatch) -> None:
    from app.services import conversation_compressor as module
    from app.services.conversation_compressor import conversation_compressor

    captured = {}

    async def fake_generate_text(*, system, user, **kwargs):
        captured["system"] = system
        captured["user"] = user
        return "- 用户要求放慢第一集节奏\n- Agent 已调整完成"

    monkeypatch.setattr(module.llm_service._settings, "llm_api_key", "test-key")
    monkeypatch.setattr(module.llm_service, "generate_text", fake_generate_text)

    messages = [
        {"id": "m1", "role": "user", "content": "把第一集节奏放慢"},
        {"id": "m2", "role": "assistant", "content": "好的，已调整"},
    ]
    result = asyncio.run(conversation_compressor.compress(messages))
    assert result["summary"].startswith("- 用户要求放慢第一集节奏")
    assert result["original_message_ids"] == ["m1", "m2"]
    # The summarizer prompt is used as system, transcript as user.
    assert "对话压缩助手" in captured["system"]
    assert "把第一集节奏放慢" in captured["user"]


def test_compressor_falls_back_on_llm_error(monkeypatch) -> None:
    from app.services import conversation_compressor as module
    from app.services.conversation_compressor import conversation_compressor
    from app.services.llm_service import LLMError

    async def boom(*, system, user, **kwargs):
        raise LLMError("boom")

    monkeypatch.setattr(module.llm_service._settings, "llm_api_key", "test-key")
    monkeypatch.setattr(module.llm_service, "generate_text", boom)

    messages = [{"id": "m1", "role": "user", "content": "确认 24 集方案"}]
    result = asyncio.run(conversation_compressor.compress(messages))
    assert "确认 24 集方案" in result["summary"]  # deterministic fallback


# ------------------------------------------------------- conversation titling
class _FakeMsg:
    def __init__(self, role, content) -> None:
        self.role = role
        self.content = content


def test_fallback_title_from_first_user_message() -> None:
    from app.models import MessageRole
    from app.services.conversation_service import conversation_service

    messages = [
        _FakeMsg(MessageRole.assistant, "你好，我能帮你做什么"),
        _FakeMsg(MessageRole.user, "帮我优化第一集的节奏感问题"),
    ]
    assert conversation_service._fallback_title(messages) == "帮我优化第一集的节奏感问题"[:16]
    assert conversation_service._fallback_title([]) == "新对话"


def test_generate_title_uses_llm(monkeypatch) -> None:
    from app.models import MessageRole
    from app.services import conversation_service as module
    from app.services.conversation_service import conversation_service

    async def fake_generate_text(*, system, user, **kwargs):
        assert "标题" in system
        return "「节奏优化」。"

    monkeypatch.setattr(module.llm_service._settings, "llm_api_key", "test-key")
    monkeypatch.setattr(module.llm_service, "generate_text", fake_generate_text)

    messages = [_FakeMsg(MessageRole.user, "把第一集节奏放慢")]
    title = asyncio.run(conversation_service._generate_title(messages))
    assert title == "节奏优化"  # quotes / punctuation stripped


# ------------------------------------------------------------- auto-pin
def test_should_autopin_key_decisions() -> None:
    from app.models import MessageRole
    from app.services.conversation_service import conversation_service

    pin = conversation_service._should_autopin
    assert pin(MessageRole.user, "我们就确认改编方案，定 24 集") is True
    assert pin(MessageRole.user, "切换 Schema 到编剧版") is True
    assert pin(MessageRole.user, "这段对白再口语一点") is False
    assert pin(MessageRole.assistant, "已按风格调整") is False  # only user messages
    assert pin(MessageRole.user, None) is False


# ------------------------------------------------------------- pdf exporter
def test_pdf_render_html_screenwriter() -> None:
    from app.exporters.pdf_exporter import pdf_exporter

    payload = {
        "schema_type": "screenwriter",
        "schema_version": "screenwriter-1.0",
        "title": "测试剧本",
        "episodes": [
            {
                "episode_number": 1,
                "content": {
                    "episode_number": 1,
                    "title": "初遇",
                    "episode_summary": "两人相遇",
                    "key_conflict": "封闭 vs 入侵",
                    "scenes": [
                        {
                            "slug_line": "内景 - 咖啡馆 - 日",
                            "action_description": "林晚独自坐着。",
                            "dialogues": [
                                {
                                    "character": "沈云洲",
                                    "parenthetical": "走近",
                                    "line": "这位置有人吗？",
                                }
                            ],
                        }
                    ],
                },
            }
        ],
    }
    html = pdf_exporter.render_html(payload)
    assert "测试剧本" in html
    assert "第 1 集 · 初遇" in html
    assert "内景 - 咖啡馆 - 日" in html
    assert "这位置有人吗？" in html
    assert "沈云洲" in html


def test_pdf_render_html_ai_video_nested_shots() -> None:
    from app.exporters.pdf_exporter import pdf_exporter

    payload = {
        "schema_type": "ai_video",
        "schema_version": "ai-video-1.0",
        "title": "AI 视频测试",
        "episodes": [
            {
                "episode_number": 1,
                "content": {
                    "episode_number": 1,
                    "title": "初遇",
                    "scenes": [
                        {
                            "location": "内景 · 咖啡馆",
                            "shots": [
                                {
                                    "shot_id": "ep1_sc1_sh1",
                                    "shot_type": "中景",
                                    "camera_movement": "推近",
                                    "subject": "林晚",
                                    "subject_action": "低头搅拌咖啡",
                                    "lighting": "侧逆光，暖色调",
                                    "generation_prompt": "A medium shot of a woman stirring coffee",
                                    "dialogue": [
                                        {
                                            "character_id": "林晚",
                                            "line": "这位置有人。",
                                            "voice_tone": "平静",
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                },
            }
        ],
    }
    html = pdf_exporter.render_html(payload)
    assert "AI 视频测试" in html
    assert "内景 · 咖啡馆" in html
    assert "推近" in html
    assert "generation_prompt" not in html  # label is 生成提示, not raw key
    assert "A medium shot of a woman stirring coffee" in html
    assert "这位置有人。" in html


def test_pdf_render_html_overview_escapes() -> None:
    from app.exporters.pdf_exporter import pdf_exporter

    payload = {
        "schema_type": "overview",
        "title": "概览 <x>",
        "episodes": [
            {
                "content": {
                    "logline": "一句话 & 故事",
                    "hook": "卖点",
                    "main_characters": [{"name": "林晚", "role": "女主", "one_liner": "外冷内热"}],
                    "plot_arc": {"setup": "开端", "climax": "高潮"},
                    "episodes": [
                        {
                            "episode_number": 1,
                            "title": "起",
                            "one_line_summary": "开始",
                            "key_scenes": [
                                {
                                    "location": "咖啡馆",
                                    "characters": ["林晚"],
                                    "conflict": "防御",
                                    "outcome": "离开",
                                    "weight": "高",
                                }
                            ],
                        }
                    ],
                }
            }
        ],
    }
    html = pdf_exporter.render_html(payload)
    assert "概览 &lt;x&gt;" in html  # title HTML-escaped
    assert "一句话 &amp; 故事" in html
    assert "林晚" in html and "咖啡馆" in html


# -------------------------------------------------------- overview (stage 6)
class _FakeNovel:
    title = "测试小说"
    summary = "一个关于成长与抉择的故事，跨越十年光阴。"
    character_arcs = [
        {"name": "林晚", "role": "female_lead", "arc": {"start": "封闭", "end": "敞开"}},
        {"name": "沈云洲", "role": "male_lead", "one_liner": "背负秘密的男人"},
    ]
    user_selected_genres = ["都市情感"]


class _FakeChapter:
    def __init__(self, num: int, title: str, summary: str) -> None:
        self.chapter_num = num
        self.title = title
        self.summary = summary


# ------------------------------------------------------ tool-calling agent
def test_registry_exposes_openai_tool_specs() -> None:
    specs = tool_registry.openai_tools()
    names = {spec["function"]["name"] for spec in specs}
    assert "chapter_get" in names and "episode_patch" in names
    chapter_get = next(s for s in specs if s["function"]["name"] == "chapter_get")
    assert chapter_get["function"]["parameters"]["required"] == ["chapter_num"]


def test_agent_runs_tool_calling_loop(monkeypatch) -> None:
    agent = ConversationAgent()
    responses = [
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call-1",
                    "type": "function",
                    "function": {
                        "name": "screenplay_validate",
                        "arguments": '{"content": {}, "schema_type": "overview"}',
                    },
                }
            ],
        },
        {"role": "assistant", "content": "已校验完成"},
    ]

    async def fake_chat_with_tools(messages, tools=None, **kwargs):
        return responses.pop(0)

    monkeypatch.setattr(agent.llm, "chat_with_tools", fake_chat_with_tools)
    result = asyncio.run(
        agent.run_conversation("帮我校验", context=ToolContext(novel_id="n1"))
    )
    assert result["status"] == "done"
    assert result["content"] == "已校验完成"
    assert len(result["tool_trace"]) == 1
    assert result["tool_trace"][0]["tool"] == "screenplay_validate"
    assert result["tool_trace"][0]["result"]["status"] == "success"


def test_overview_fallback_document_shape() -> None:
    from app.services.overview_service import overview_service

    chapters = [_FakeChapter(i, f"第{i}章", f"第{i}章梗概") for i in range(1, 13)]
    doc = overview_service._fallback_document(_FakeNovel(), chapters)
    assert doc["schema_type"] == "overview"
    assert doc["schema_version"] == "overview-1.0"
    assert doc["title"] == "测试小说"
    assert doc["logline"].startswith("一个关于成长")
    assert doc["estimated_episodes"] == 6
    assert doc["genre"] == "都市情感"
    assert [c["name"] for c in doc["main_characters"]] == ["林晚", "沈云洲"]
    assert doc["main_characters"][1]["one_liner"] == "背负秘密的男人"
    # Only the first 10 chapters are listed in the fallback overview.
    assert len(doc["episodes"]) == 10
    assert doc["is_fallback"] is True
