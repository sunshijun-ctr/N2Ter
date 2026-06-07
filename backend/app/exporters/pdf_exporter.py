"""Screenplay -> PDF exporter (WeasyPrint).

Renders a screenplay payload (as produced by ``ExportService``) to a styled,
print-ready PDF. Each of the three schema types gets a tailored layout. The
native-library bootstrap (``app.pdf_runtime``) is invoked lazily so importing
this module never fails even when WeasyPrint's GTK libraries are missing.
"""

from html import escape
from typing import Any

from app import pdf_runtime

_BASE_CSS = """
@page { size: A4; margin: 2cm 1.8cm; }
body { font-family: "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC",
       "SimSun", "Microsoft YaHei", serif; font-size: 11pt; line-height: 1.6;
       color: #1a1a1a; }
h1 { font-size: 22pt; margin: 0 0 4pt; }
h2 { font-size: 15pt; margin: 22pt 0 6pt; padding-bottom: 4pt;
     border-bottom: 2px solid #333; }
h3 { font-size: 12.5pt; margin: 14pt 0 4pt; color: #222; }
.meta { color: #555; font-size: 10pt; margin-bottom: 2pt; }
.tagline { font-style: italic; color: #444; margin: 6pt 0 14pt; }
.kv { margin: 2pt 0; }
.kv b { display: inline-block; min-width: 6em; color: #333; }
.scene { margin: 10pt 0; padding-left: 8pt; border-left: 3px solid #ccc; }
.slug { font-weight: bold; text-transform: none; }
.action { margin: 4pt 0; white-space: pre-wrap; }
.dialogue { margin: 4pt 0 4pt 2em; }
.dialogue .who { font-weight: bold; }
.paren { color: #666; font-style: italic; }
.note { color: #777; font-size: 9.5pt; }
table.scenes { width: 100%; border-collapse: collapse; margin: 6pt 0; }
table.scenes th, table.scenes td { border: 1px solid #ccc; padding: 4pt 6pt;
     font-size: 10pt; text-align: left; vertical-align: top; }
table.scenes th { background: #f2f2f2; }
.episode { page-break-inside: avoid; margin-bottom: 6pt; }
"""


class PDFExporter:
    # --------------------------------------------------------------- public
    def available(self) -> bool:
        pdf_runtime.configure()
        try:
            import weasyprint  # noqa: F401
        except Exception:
            return False
        return True

    def render_pdf(self, payload: dict[str, Any]) -> bytes:
        pdf_runtime.configure()
        import weasyprint

        html = self.render_html(payload)
        return weasyprint.HTML(string=html).write_pdf()

    def render_html(self, payload: dict[str, Any]) -> str:
        schema_type = payload.get("schema_type", "screenwriter")
        title = payload.get("title") or "剧本"
        episodes = payload.get("episodes") or []

        if schema_type == "overview":
            body = self._render_overview(episodes)
        elif schema_type == "ai_video":
            body = self._render_ai_video(episodes)
        else:
            body = self._render_screenwriter(episodes)

        return (
            f"<!DOCTYPE html><html lang='zh'><head><meta charset='utf-8'>"
            f"<style>{_BASE_CSS}</style></head><body>"
            f"<h1>{escape(str(title))}</h1>"
            f"<div class='meta'>格式：{escape(str(schema_type))} · "
            f"版本：{escape(str(payload.get('schema_version', '')))}</div>"
            f"{body}</body></html>"
        )

    # ------------------------------------------------------------- overview
    def _render_overview(self, episodes: list[dict]) -> str:
        doc = episodes[0].get("content") if episodes else {}
        doc = doc or {}
        parts: list[str] = []
        if doc.get("logline"):
            parts.append(f"<p class='tagline'>{escape(str(doc['logline']))}</p>")
        for label, key in (
            ("卖点", "hook"),
            ("题材", "genre"),
            ("预估集数", "estimated_episodes"),
            ("目标受众", "target_audience"),
            ("类比作品", "market_comparable"),
            ("改编难度", "adaptation_difficulty"),
        ):
            value = doc.get(key)
            if value:
                parts.append(f"<div class='kv'><b>{label}</b>{escape(str(value))}</div>")

        characters = doc.get("main_characters") or []
        if characters:
            parts.append("<h2>主要角色</h2>")
            for character in characters:
                name = escape(str(character.get("name", "")))
                role = escape(str(character.get("role", "")))
                one = escape(str(character.get("one_liner", "")))
                parts.append(f"<div class='kv'><b>{name}</b>{role}　{one}</div>")

        arc = doc.get("plot_arc") or {}
        if arc:
            parts.append("<h2>情节主线</h2>")
            for label, key in (
                ("开端", "setup"),
                ("触发", "inciting_incident"),
                ("发展", "rising_action"),
                ("高潮", "climax"),
                ("结局", "resolution"),
            ):
                if arc.get(key):
                    parts.append(
                        f"<div class='kv'><b>{label}</b>{escape(str(arc[key]))}</div>"
                    )

        overview_episodes = doc.get("episodes") or []
        if overview_episodes:
            parts.append("<h2>分集概览</h2>")
            for ep in overview_episodes:
                num = escape(str(ep.get("episode_number", "")))
                ep_title = escape(str(ep.get("title", "")))
                summary = escape(str(ep.get("one_line_summary", "")))
                parts.append(f"<h3>第 {num} 集 · {ep_title}</h3>")
                if summary:
                    parts.append(f"<p>{summary}</p>")
                parts.append(self._scene_table(ep.get("key_scenes") or []))
        return "".join(parts)

    def _scene_table(self, scenes: list[dict]) -> str:
        if not scenes:
            return ""
        rows = [
            "<tr><th>地点</th><th>出场角色</th><th>核心冲突</th><th>结果</th><th>权重</th></tr>"
        ]
        for scene in scenes:
            chars = scene.get("characters") or []
            chars = "、".join(str(c) for c in chars) if isinstance(chars, list) else str(chars)
            rows.append(
                "<tr>"
                f"<td>{escape(str(scene.get('location', '')))}</td>"
                f"<td>{escape(chars)}</td>"
                f"<td>{escape(str(scene.get('conflict', '')))}</td>"
                f"<td>{escape(str(scene.get('outcome', '')))}</td>"
                f"<td>{escape(str(scene.get('weight', '')))}</td>"
                "</tr>"
            )
        return f"<table class='scenes'>{''.join(rows)}</table>"

    # --------------------------------------------------------- screenwriter
    def _render_screenwriter(self, episodes: list[dict]) -> str:
        parts: list[str] = []
        for episode in episodes:
            content = episode.get("content") or {}
            num = escape(str(content.get("episode_number", episode.get("episode_number", ""))))
            ep_title = escape(str(content.get("title") or episode.get("title") or ""))
            parts.append(f"<div class='episode'><h2>第 {num} 集 · {ep_title}</h2>")
            for label, key in (
                ("本集梗概", "episode_summary"),
                ("核心冲突", "key_conflict"),
                ("情感曲线", "emotional_arc"),
            ):
                if content.get(key):
                    parts.append(
                        f"<div class='kv'><b>{label}</b>{escape(str(content[key]))}</div>"
                    )
            for scene in content.get("scenes") or []:
                parts.append(self._render_screenwriter_scene(scene))
            parts.append("</div>")
        return "".join(parts)

    def _render_screenwriter_scene(self, scene: dict) -> str:
        parts = ["<div class='scene'>"]
        slug = scene.get("slug_line") or scene.get("scene_objective") or "场景"
        parts.append(f"<div class='slug'>{escape(str(slug))}</div>")
        if scene.get("action_description"):
            parts.append(f"<div class='action'>{escape(str(scene['action_description']))}</div>")
        for dialogue in scene.get("dialogues") or []:
            who = escape(str(dialogue.get("character", "")))
            paren = dialogue.get("parenthetical")
            line = escape(str(dialogue.get("line", "")))
            paren_html = f" <span class='paren'>（{escape(str(paren))}）</span>" if paren else ""
            parts.append(
                f"<div class='dialogue'><span class='who'>{who}</span>{paren_html}：{line}</div>"
            )
        if scene.get("rewrite_notes"):
            parts.append(f"<div class='note'>改写建议：{escape(str(scene['rewrite_notes']))}</div>")
        parts.append("</div>")
        return "".join(parts)

    # -------------------------------------------------------------- ai_video
    @staticmethod
    def _character_id_map(content: dict) -> dict[str, str]:
        mapping: dict[str, str] = {}
        for item in content.get("character_profiles") or []:
            if not isinstance(item, dict):
                continue
            cid = item.get("id") or item.get("character_id")
            name = item.get("name")
            if cid and name:
                mapping[str(cid)] = str(name)
        return mapping

    @staticmethod
    def _resolve_character_ref(ref: str, id_map: dict[str, str]) -> str:
        ref = (ref or "").strip()
        if not ref:
            return ""
        if ref in id_map:
            return id_map[ref]
        import re

        if re.match(r"^char_\d+$", ref, re.I):
            match = re.search(r"\d+", ref)
            return f"角色 {match.group()}" if match else ref
        return ref

    def _render_ai_video(self, episodes: list[dict]) -> str:
        parts: list[str] = []
        for episode in episodes:
            content = episode.get("content") or {}
            id_map = self._character_id_map(content)
            num = escape(str(content.get("episode_number", episode.get("episode_number", ""))))
            ep_title = escape(str(content.get("title") or episode.get("title") or ""))
            parts.append(f"<div class='episode'><h2>第 {num} 集 · {ep_title}</h2>")
            top_shots = content.get("shots")
            if isinstance(top_shots, list) and top_shots:
                for index, shot in enumerate(top_shots, start=1):
                    parts.append(self._render_ai_video_shot(shot, index, id_map))
            else:
                for scene in content.get("scenes") or []:
                    scene_label = (
                        scene.get("location")
                        or scene.get("slug_line")
                        or scene.get("heading")
                    )
                    if scene_label:
                        parts.append(f"<h3>{escape(str(scene_label))}</h3>")
                    for index, shot in enumerate(scene.get("shots") or [], start=1):
                        parts.append(self._render_ai_video_shot(shot, index, id_map))
            parts.append("</div>")
        return "".join(parts)

    def _render_ai_video_shot(self, shot: dict, index: int, id_map: dict[str, str]) -> str:
        parts = ["<div class='scene'>"]
        shot_id = shot.get("shot_id") or shot.get("id")
        label = f"镜头 {index}"
        if shot_id:
            label = f"{label} · {shot_id}"
        parts.append(f"<div class='slug'>{escape(str(label))}</div>")
        for label, key in (
            ("景别", "shot_type"),
            ("角度", "camera_angle"),
            ("运镜", "camera_movement"),
            ("时长", "duration_seconds"),
            ("主体", "subject"),
            ("动作", "subject_action"),
            ("背景", "background"),
            ("光线", "lighting"),
            ("生成提示", "generation_prompt"),
        ):
            value = shot.get(key)
            if value not in (None, ""):
                display = (
                    self._resolve_character_ref(str(value), id_map)
                    if key == "subject"
                    else str(value)
                )
                parts.append(f"<div class='kv'><b>{label}</b>{escape(display)}</div>")
        for dialogue in shot.get("dialogue") or shot.get("dialogues") or []:
            raw_who = dialogue.get("character_id") or dialogue.get("character") or ""
            who = self._resolve_character_ref(str(raw_who), id_map)
            line = dialogue.get("line") or dialogue.get("text") or ""
            if not line:
                continue
            tone = dialogue.get("voice_tone")
            tone_html = (
                f" <span class='paren'>（{escape(str(tone))}）</span>" if tone else ""
            )
            parts.append(
                f"<div class='dialogue'><span class='who'>{escape(str(who))}</span>"
                f"{tone_html}：{escape(str(line))}</div>"
            )
        parts.append("</div>")
        return "".join(parts)


pdf_exporter = PDFExporter()
