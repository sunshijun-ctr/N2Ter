"""Lightweight, dependency-free token estimator.

Used to decide when a conversation should be auto-compressed (Design.md
§10.4.3). It is intentionally approximate: CJK characters count as ~1 token
each, other text as ~1 token per 4 characters — a reasonable upper bound across
common tokenizers without pulling in a heavy tokenizer dependency.
"""

import math


def _is_cjk(char: str) -> bool:
    code = ord(char)
    return (
        0x4E00 <= code <= 0x9FFF  # CJK Unified Ideographs
        or 0x3400 <= code <= 0x4DBF  # Extension A
        or 0x3000 <= code <= 0x303F  # CJK punctuation
        or 0xFF00 <= code <= 0xFFEF  # full-width forms
    )


def estimate_tokens(text: str | None) -> int:
    if not text:
        return 0
    cjk = sum(1 for char in text if _is_cjk(char))
    other = len(text) - cjk
    return cjk + math.ceil(other / 4)
