class ConversationCompressor:
    async def compress(self, messages: list[dict]) -> dict:
        return {"summary": "", "message_count": len(messages)}


conversation_compressor = ConversationCompressor()
