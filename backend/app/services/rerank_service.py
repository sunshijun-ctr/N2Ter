class RerankService:
    async def rerank(self, query: str, items: list[dict]) -> list[dict]:
        return items


rerank_service = RerankService()
