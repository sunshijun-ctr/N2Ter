import re
from dataclasses import dataclass


CHAPTER_HEADING_RE = re.compile(
    r"(?m)^(?P<title>\s*(?:第[零〇一二三四五六七八九十百千万\d]+[章节回卷部集]|楔子|序章|引子|尾声|番外)[^。！？；，,.!?;\n\r]{0,50})\s*$"
)


@dataclass(frozen=True)
class ParsedChapter:
    chapter_num: int
    title: str
    content: str
    word_count: int
    special_type: str | None = None


def split_chapters(content: str) -> list[ParsedChapter]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    matches = list(CHAPTER_HEADING_RE.finditer(normalized))
    if not matches:
        return [_build_chapter(1, "正文", normalized)]

    chapters: list[ParsedChapter] = []
    preface = normalized[: matches[0].start()].strip()
    next_num = 1
    if preface:
        chapters.append(_build_chapter(next_num, "正文前言", preface, special_type="preface"))
        next_num += 1

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        title = match.group("title").strip()
        body = normalized[start:end].strip()
        full_content = f"{title}\n{body}".strip()
        chapters.append(
            _build_chapter(
                next_num,
                title,
                full_content,
                special_type=_detect_special_type(title),
            )
        )
        next_num += 1

    return chapters


def _build_chapter(
    chapter_num: int, title: str, content: str, special_type: str | None = None
) -> ParsedChapter:
    return ParsedChapter(
        chapter_num=chapter_num,
        title=title,
        content=content,
        word_count=len(re.sub(r"\s+", "", content)),
        special_type=special_type,
    )


def _detect_special_type(title: str) -> str | None:
    if title.startswith(("楔子", "序章", "引子")):
        return "prologue"
    if title.startswith("尾声"):
        return "epilogue"
    if title.startswith("番外"):
        return "extra"
    return None
