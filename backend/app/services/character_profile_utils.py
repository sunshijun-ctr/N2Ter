"""AI 视频 schema：character_id ↔ 中文角色名（生成、导出、PDF、UI 共用）"""

from __future__ import annotations

import re
from typing import Any

CHAR_NUMERIC_ID_RE = re.compile(r"^char_\d+$", re.I)
CHAR_TOKEN_RE = re.compile(r"^char_", re.I)
SHOT_ID_RE = re.compile(r"^ep(\d+)_sc(\d+)_sh(\d+)$", re.I)

# 常见拼音 slug → 姓氏/名首字，用于 char_wu_modern / char_qin 等语义 id 兜底
_PINYIN_SURNAME_HINTS: dict[str, str] = {
    "wu": "吴",
    "qin": "秦",
    "li": "李",
    "wang": "王",
    "zhang": "张",
    "lin": "林",
    "chen": "陈",
    "liu": "刘",
    "zhao": "赵",
    "sun": "孙",
    "zhou": "周",
    "huang": "黄",
    "yang": "杨",
    "xu": "徐",
    "ma": "马",
    "zhu": "朱",
    "hu": "胡",
    "guo": "郭",
    "he": "何",
    "gao": "高",
    "luo": "罗",
    "zheng": "郑",
    "liang": "梁",
    "xie": "谢",
    "tang": "唐",
    "han": "韩",
    "feng": "冯",
    "deng": "邓",
    "cao": "曹",
    "peng": "彭",
    "zeng": "曾",
    "xiao": "肖",
    "tian": "田",
    "dong": "董",
    "pan": "潘",
    "yuan": "袁",
    "cai": "蔡",
    "jiang": "蒋",
    "yu": "余",
    "du": "杜",
    "ye": "叶",
    "cheng": "程",
    "wei": "魏",
    "su": "苏",
    "lu": "卢",
    "ding": "丁",
    "ren": "任",
    "shen": "沈",
    "yao": "姚",
    "tan": "谭",
    "sheng": "盛",
    "zou": "邹",
    "xiong": "熊",
    "jin": "金",
    "shi": "石",
    "jia": "贾",
    "xia": "夏",
    "wei2": "韦",
    "fan": "范",
    "fang": "方",
    "kong": "孔",
    "bai": "白",
    "cui": "崔",
    "kang": "康",
    "mao": "毛",
    "qiu": "邱",
    "qin2": "秦",
    "shi2": "史",
    "gu": "顾",
    "hou": "侯",
    "shao": "邵",
    "meng": "孟",
    "long": "龙",
    "wan": "万",
    "duan": "段",
    "lei": "雷",
    "qian": "钱",
    "yun": "云",
    "yun2": "韵",
}


def is_character_token(ref: str | None) -> bool:
    return bool(CHAR_TOKEN_RE.match((ref or "").strip()))


def slug_surname_hint(char_id: str) -> str | None:
    """从 char_wu_modern 提取 wu → 吴。"""
    slug = (char_id or "").strip()
    if slug.lower().startswith("char_"):
        slug = slug[5:]
    head = slug.split("_")[0].lower()
    if not head or head.isdigit():
        return None
    return _PINYIN_SURNAME_HINTS.get(head)


def extract_profiles_deep(content: dict[str, Any]) -> list[dict[str, Any]]:
    """递归收集 content 内任意层级的 character_profiles。"""
    found: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(item: dict[str, Any]) -> None:
        cid = str(item.get("id") or item.get("character_id") or "").strip()
        name = str(item.get("name") or "").strip()
        if not cid or not name or cid in seen:
            return
        if is_character_token(name):
            return
        seen.add(cid)
        found.append({"id": cid, "name": name, **{k: v for k, v in item.items() if k not in ("id", "name")}})

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            profiles = node.get("character_profiles")
            if isinstance(profiles, list):
                for item in profiles:
                    if isinstance(item, dict):
                        add(item)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(content)
    top = content.get("character_profiles")
    if isinstance(top, list):
        for item in top:
            if isinstance(item, dict):
                add(item)
    return found


def extract_inline_id_name_pairs(content: dict[str, Any]) -> dict[str, str]:
    """从对白等对象里同时出现的 character_id + 中文名提取映射。"""
    pairs: dict[str, str] = {}

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            cid = node.get("character_id")
            if cid:
                cid_str = str(cid).strip()
                for key in ("name", "character", "speaker", "character_name"):
                    raw = node.get(key)
                    if raw is None:
                        continue
                    name = str(raw).strip()
                    if name and not is_character_token(name):
                        pairs[cid_str] = name
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(content)
    return pairs


def collect_character_tokens(content: dict[str, Any]) -> set[str]:
    tokens: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key in ("character_id", "subject"):
                raw = node.get(key)
                if raw is not None and is_character_token(str(raw)):
                    tokens.add(str(raw).strip())
            emos = node.get("character_emotion")
            if isinstance(emos, list):
                for item in emos:
                    if isinstance(item, dict):
                        raw = item.get("character_id") or item.get("character")
                        if raw is not None and is_character_token(str(raw)):
                            tokens.add(str(raw).strip())
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(content)
    return tokens


def collect_scene_character_names(content: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for scene in content.get("scenes") or []:
        if not isinstance(scene, dict):
            continue
        for raw in scene.get("characters") or []:
            name = str(raw).strip()
            if name and not is_character_token(name):
                names.append(name)
    return names


def _match_name_by_hint(hint: str, candidates: list[str]) -> str | None:
    if not hint or not candidates:
        return None
    matches = [n for n in candidates if hint in n]
    if len(matches) == 1:
        return matches[0]
    if matches:
        return sorted(matches, key=len)[0]
    return None


def infer_name_for_token(
    char_id: str,
    *,
    scene_names: list[str],
    character_arcs: list[dict[str, Any]] | None,
) -> str | None:
    hint = slug_surname_hint(char_id)
    if not hint:
        return None

    matched = _match_name_by_hint(hint, scene_names)
    if matched:
        return matched

    arc_names = [
        str(a.get("name")).strip()
        for a in (character_arcs or [])
        if isinstance(a, dict) and a.get("name")
    ]
    return _match_name_by_hint(hint, arc_names)


def build_character_id_map(
    profiles: list[dict[str, Any]] | None = None,
    character_arcs: list[dict[str, Any]] | None = None,
) -> dict[str, str]:
    mapping: dict[str, str] = {}

    if profiles:
        for item in profiles:
            if not isinstance(item, dict):
                continue
            cid = item.get("id") or item.get("character_id")
            name = item.get("name")
            if cid and name and not is_character_token(str(name)):
                mapping[str(cid)] = str(name)

    if character_arcs:
        for index, arc in enumerate(character_arcs):
            if not isinstance(arc, dict):
                continue
            name = arc.get("name")
            if not name:
                continue
            cid = str(arc.get("id") or arc.get("character_id") or f"char_{index + 1:02d}")
            mapping.setdefault(cid, str(name))

    return mapping


def build_comprehensive_character_map(
    content: dict[str, Any],
    character_arcs: list[dict[str, Any]] | None = None,
) -> dict[str, str]:
    """合并 profiles、inline 映射、场景角色名与 arcs 推断。"""
    profiles = extract_profiles_deep(content)
    id_map = build_character_id_map(profiles, character_arcs)
    id_map.update(extract_inline_id_name_pairs(content))

    scene_names = collect_scene_character_names(content)
    arc_names = [
        str(a.get("name")).strip()
        for a in (character_arcs or [])
        if isinstance(a, dict) and a.get("name")
    ]
    profile_names = [v for v in id_map.values() if v and not is_character_token(str(v))]
    name_candidates = list(dict.fromkeys(scene_names + arc_names + profile_names))
    for token in collect_character_tokens(content):
        if token in id_map:
            continue
        inferred = infer_name_for_token(
            token, scene_names=name_candidates, character_arcs=character_arcs
        )
        if inferred:
            id_map[token] = inferred

    return id_map


def merge_character_id_maps(*maps: dict[str, str]) -> dict[str, str]:
    merged: dict[str, str] = {}
    for item in maps:
        merged.update(item)
    return merged


def ensure_character_profiles(
    content: dict[str, Any], character_arcs: list[dict[str, Any]] | None
) -> dict[str, Any]:
    """补全/合并 character_profiles，覆盖语义 id（char_wu_modern 等）。"""
    content = dict(content or {})
    id_map = build_comprehensive_character_map(content, character_arcs)

    if id_map:
        existing = extract_profiles_deep(content)
        by_id: dict[str, dict[str, Any]] = {}
        for item in existing:
            cid = str(item.get("id") or item.get("character_id") or "").strip()
            if cid:
                by_id[cid] = {**item, "id": cid, "name": id_map.get(cid, item.get("name", ""))}
        for cid, name in id_map.items():
            if cid not in by_id and is_character_token(cid):
                by_id[cid] = {"id": cid, "name": name, "appearance": ""}
            elif cid in by_id:
                by_id[cid]["name"] = name
        content["character_profiles"] = list(by_id.values())
        return content

    profiles = content.get("character_profiles")
    if isinstance(profiles, list) and profiles:
        return content

    arcs = character_arcs or []
    built: list[dict[str, str]] = []
    for index, arc in enumerate(arcs):
        if not isinstance(arc, dict):
            continue
        name = arc.get("name")
        if not name:
            continue
        built.append(
            {
                "id": f"char_{index + 1:02d}",
                "name": str(name),
                "appearance": str(
                    arc.get("one_liner") or (arc.get("arc") or {}).get("start") or ""
                ),
            }
        )
    if built:
        content["character_profiles"] = built
    return content


def resolve_character_ref(ref: str, id_map: dict[str, str]) -> str:
    text = (ref or "").strip()
    if not text:
        return ""
    if text in id_map:
        return id_map[text]
    if CHAR_NUMERIC_ID_RE.match(text):
        match = re.search(r"\d+", text)
        return f"角色 {match.group()}" if match else text
    if is_character_token(text):
        hint = slug_surname_hint(text)
        if hint:
            return hint
    return text


def resolve_character_text(text: str, id_map: dict[str, str]) -> str:
    """Replace every char_* token embedded in a longer string."""
    value = (text or "").strip()
    if not value:
        return ""

    def _replace(match: re.Match[str]) -> str:
        token = match.group(0)
        resolved = resolve_character_ref(token, id_map)
        return resolved if resolved and resolved != token else token

    return re.sub(r"\bchar_\w+\b", _replace, value, flags=re.I)


def format_shot_label(
    shot: dict[str, Any],
    *,
    scene_index: int,
    shot_index: int,
    episode_num: int | str | None,
) -> str:
    shot_id = str(shot.get("shot_id") or shot.get("id") or "")
    match = SHOT_ID_RE.match(shot_id)
    if match:
        ep, sc, sh = (int(match.group(i)) for i in range(1, 4))
        return f"第 {ep} 集 · 场景 {sc} · 镜头 {sh}"
    ep = episode_num if episode_num not in (None, "") else "?"
    return f"第 {ep} 集 · 场景 {scene_index} · 镜头 {shot_index}"


def collect_character_id_map_from_episodes(
    episodes: list[dict[str, Any]],
    character_arcs: list[dict[str, Any]] | None = None,
) -> dict[str, str]:
    maps: list[dict[str, str]] = []
    for episode in episodes:
        content = dict(episode.get("content") or {})
        enriched = ensure_character_profiles(content, character_arcs)
        maps.append(build_comprehensive_character_map(enriched, character_arcs))
    maps.append(build_character_id_map(None, character_arcs))
    return merge_character_id_maps(*maps)
