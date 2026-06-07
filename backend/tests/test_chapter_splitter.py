from app.services.chapter_splitter import split_chapters


def test_split_by_headings_when_enough_markers() -> None:
    text = "\n".join(
        [
            "前言内容",
            "第一章 开端",
            "第一段正文。",
            "第二章 冲突",
            "第二段正文。",
            "第三章 高潮",
            "第三段正文。",
        ]
    )
    chapters = split_chapters(text)
    assert len(chapters) >= 4
    assert any("第一章" in ch.title for ch in chapters)


def test_auto_split_when_no_headings() -> None:
    body = "这是正文。" * 800
    chapters = split_chapters(body, words_per_chapter=500)
    assert len(chapters) > 1
    assert all("自动分章" in ch.title for ch in chapters)
    assert all(ch.special_type == "pseudo" for ch in chapters)


def test_auto_split_when_too_few_headings() -> None:
    text = "只有一章标记\n第一章 唯一\n" + "内容。" * 600
    chapters = split_chapters(text, words_per_chapter=400)
    assert len(chapters) > 1
    assert all("自动分章" in ch.title for ch in chapters)


def test_headings_only_when_zero_words_per_chapter() -> None:
    body = "这是正文。" * 800
    chapters = split_chapters(body, words_per_chapter=0)
    assert len(chapters) == 1
    assert chapters[0].title == "正文"
    assert "自动分章" not in chapters[0].title


def test_headings_only_skips_oversized_resplit() -> None:
    long_chapter = "第一章 很长\n" + "内容。" * 15_000
    text = "\n".join(
        [
            long_chapter,
            "第二章 正常",
            "短正文。",
            "第三章 结尾",
            "收尾。",
        ]
    )
    chapters = split_chapters(text, words_per_chapter=0)
    assert len(chapters) >= 3
    assert any("第一章" in ch.title for ch in chapters)
    assert all(" · " not in ch.title for ch in chapters)
