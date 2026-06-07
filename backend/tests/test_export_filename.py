from app.services.export_filename import export_basename


def test_export_basename_uses_novel_title() -> None:
    assert export_basename("测试小说") == "测试小说"
    assert export_basename("  我的书  ") == "我的书"


def test_export_basename_strips_invalid_chars() -> None:
    assert export_basename('书名:副标题/试') == "书名副标题试"


def test_export_basename_fallback() -> None:
    assert export_basename("") == "screenplay"
    assert export_basename("   ") == "screenplay"
