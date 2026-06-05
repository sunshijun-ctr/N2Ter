from typing import Any


class PDFExporter:
    def render_html(self, content: dict[str, Any]) -> str:
        title = content.get("title", "剧本")
        return f"<html><body><h1>{title}</h1></body></html>"
