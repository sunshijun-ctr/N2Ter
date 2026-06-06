from pydantic import BaseModel


class PromptInfo(BaseModel):
    name: str
    filename: str
    size: int


class PromptRead(PromptInfo):
    content: str
