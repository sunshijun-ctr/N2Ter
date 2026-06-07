"""Human-readable export filenames from novel / screenplay titles."""

from __future__ import annotations

import re

_INVALID_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
_MAX_LEN = 80


def export_basename(title: str | None, *, fallback: str = "screenplay") -> str:
    """Filesystem-safe base name (no extension). Uses upload novel title when given."""
    text = _INVALID_CHARS.sub("", (title or "").strip())
    text = text.strip(" .")
    if not text:
        return fallback
    return text[:_MAX_LEN]
