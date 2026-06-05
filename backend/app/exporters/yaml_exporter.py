import json
from typing import Any


class YAMLExporter:
    def render(self, content: dict[str, Any]) -> str:
        return json.dumps(content, ensure_ascii=False, indent=2)
