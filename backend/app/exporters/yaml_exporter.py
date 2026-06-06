from typing import Any

import yaml


class YAMLExporter:
    def render(self, content: dict[str, Any]) -> str:
        return yaml.safe_dump(content, allow_unicode=True, sort_keys=False)
