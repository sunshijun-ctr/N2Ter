import re
from dataclasses import dataclass

MIN_HEADING_COUNT = 3
DEFAULT_WORDS_PER_CHAPTER = 5000
MAX_CHAPTER_WORDS = 20_000

SKIP_HEADING_RE = re.compile(
    r"^\s*(?:目录|目\s*录|内容简介|内容提要|作品简介|版权(?:说明)?|声明|作者(?:的话|感言)?|上架感言)\s*$",
    re.I,
)

CHAPTER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"^\s*(?:第[零〇一二三四五六七八九十百千万\d]+[章节回卷部集]"
        r"|楔子|序章|引子|尾声|番外)[^。！？；，,.!?;\n\r]{0,50}\s*$"
    ),
    re.compile(r"^\s*[Cc]hapter\s+\d+[^\n]{0,40}\s*$"),
    re.compile(r"^\s*第[零〇一二三四五六七八九十百千万\d]+[节][^。！？；，,.!?;\n\r]{0,50}\s*$"),
    re.compile(r"^\s*\d+[\.、．]\s*[^\d\n]{1,40}\s*$"),
]


@dataclass(frozen=True)
class ParsedChapter:
    chapter_num: int
    title: str
    content: str
    word_count: int
    special_type: str | None = None


def split_chapters(
    content: str, *, words_per_chapter: int = DEFAULT_WORDS_PER_CHAPTER
) -> list[ParsedChapter]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    heading_matches = _find_heading_matches(normalized)
    if len(heading_matches) >= MIN_HEADING_COUNT:
        chapters = _split_by_headings(normalized, heading_matches)
    elif words_per_chapter == 0:
        chapters = [_build_chapter(1, "正文", normalized)]
    else:
        chapters = _split_by_word_count(normalized, words_per_chapter)

    if words_per_chapter == 0:
        return chapters
    return _split_oversized(chapters, words_per_chapter)


def _count_words(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def _find_heading_matches(text: str) -> list[tuple[int, int, str]]:
    """Return (start, end, title) for each heading line matched by the dominant pattern."""
    lines = text.split("\n")
    pattern_counts = [0] * len(CHAPTER_PATTERNS)
    line_infos: list[tuple[int, int, str]] = []
    offset = 0
    for line in lines:
        stripped = line.strip()
        line_end = offset + len(line)
        if stripped and not SKIP_HEADING_RE.match(stripped):
            for index, pattern in enumerate(CHAPTER_PATTERNS):
                if pattern.match(stripped):
                    pattern_counts[index] += 1
                    line_infos.append((offset, line_end, stripped, index))
                    break
        offset = line_end + 1

    if not pattern_counts or max(pattern_counts) < MIN_HEADING_COUNT:
        return []

    best_index = max(range(len(pattern_counts)), key=lambda i: pattern_counts[i])
    return [(start, end, title) for start, end, title, idx in line_infos if idx == best_index]


def _split_by_headings(text: str, matches: list[tuple[int, int, str]]) -> list[ParsedChapter]:
    chapters: list[ParsedChapter] = []
    preface = text[: matches[0][0]].strip()
    next_num = 1
    if preface:
        chapters.append(_build_chapter(next_num, "正文前言", preface, special_type="preface"))
        next_num += 1

    for index, (start, end, title) in enumerate(matches):
        body_start = end
        body_end = matches[index + 1][0] if index + 1 < len(matches) else len(text)
        body = text[body_start:body_end].strip()
        full_content = f"{title}\n{body}".strip() if body else title
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


def _normalize_paragraphs(text: str) -> list[str]:
    """Prefer blank-line paragraphs; fall back to single newlines for crawled txt."""
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if len(paragraphs) <= 1:
        line_paragraphs = [ln.strip() for ln in text.split("\n") if ln.strip()]
        if len(line_paragraphs) > 1:
            return line_paragraphs
    if not paragraphs:
        return [ln.strip() for ln in text.split("\n") if ln.strip()]
    return paragraphs


def _split_by_word_count(text: str, words_per_chapter: int) -> list[ParsedChapter]:
    target = max(500, words_per_chapter)
    paragraphs = _normalize_paragraphs(text)
    if not paragraphs:
        return [_build_chapter(1, "正文", text, special_type="pseudo")]

    chunks: list[str] = []
    bucket: list[str] = []
    bucket_words = 0

    def flush() -> None:
        nonlocal bucket, bucket_words
        if bucket:
            chunks.append("\n\n".join(bucket))
            bucket = []
            bucket_words = 0

    for para in paragraphs:
        para_words = _count_words(para)
        if para_words > target * 1.5:
            flush()
            chunks.extend(_hard_split_paragraph(para, target))
            continue
        if bucket_words + para_words > target and bucket:
            flush()
        bucket.append(para)
        bucket_words += para_words

    flush()

    if not chunks:
        chunks = [text]

    return [
        _build_chapter(index, f"第 {index} 段（自动分章）", chunk, special_type="pseudo")
        for index, chunk in enumerate(chunks, start=1)
    ]


def _hard_split_paragraph(text: str, target: int) -> list[str]:
    """Split a long paragraph block at sentence boundaries when possible."""
    sentences = re.split(r"(?<=[。！？!?…\n])", text)
    sentences = [s for s in sentences if s.strip()]
    if len(sentences) <= 1:
        return _fixed_windows(text, target)

    chunks: list[str] = []
    bucket: list[str] = []
    bucket_words = 0
    for sentence in sentences:
        sw = _count_words(sentence)
        if bucket_words + sw > target and bucket:
            chunks.append("".join(bucket).strip())
            bucket = [sentence]
            bucket_words = sw
        else:
            bucket.append(sentence)
            bucket_words += sw
    if bucket:
        chunks.append("".join(bucket).strip())
    return [c for c in chunks if c]


def _fixed_windows(text: str, target: int) -> list[str]:
    chars = re.sub(r"\s+", "", text)
    if not chars:
        return [text]
    chunks: list[str] = []
    for index in range(0, len(chars), target):
        chunks.append(chars[index : index + target])
    return chunks


def _split_oversized(
    chapters: list[ParsedChapter], words_per_chapter: int
) -> list[ParsedChapter]:
    result: list[ParsedChapter] = []
    next_num = 1
    for chapter in chapters:
        if chapter.word_count <= MAX_CHAPTER_WORDS:
            result.append(
                ParsedChapter(
                    chapter_num=next_num,
                    title=chapter.title,
                    content=chapter.content,
                    word_count=chapter.word_count,
                    special_type=chapter.special_type,
                )
            )
            next_num += 1
            continue
        for sub_index, chunk in enumerate(
            _split_by_word_count(chapter.content, words_per_chapter), start=1
        ):
            suffix = f" · {sub_index}" if sub_index > 1 else ""
            result.append(
                ParsedChapter(
                    chapter_num=next_num,
                    title=f"{chapter.title}{suffix}",
                    content=chunk.content,
                    word_count=chunk.word_count,
                    special_type=chapter.special_type or "pseudo",
                )
            )
            next_num += 1
    return result


def _build_chapter(
    chapter_num: int, title: str, content: str, special_type: str | None = None
) -> ParsedChapter:
    return ParsedChapter(
        chapter_num=chapter_num,
        title=title,
        content=content,
        word_count=_count_words(content),
        special_type=special_type,
    )


def _detect_special_type(title: str) -> str | None:
    if title.startswith(("楔子", "序章", "引子")):
        return "prologue"
    if title.startswith("尾声"):
        return "epilogue"
    if title.startswith("番外"):
        return "extra"
    if "自动分章" in title:
        return "pseudo"
    return None
