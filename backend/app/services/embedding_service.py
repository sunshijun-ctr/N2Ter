class EmbeddingService:
    async def embed(self, text: str) -> list[float]:
        return [0.0] * min(8, max(1, len(text) // 100))


embedding_service = EmbeddingService()
