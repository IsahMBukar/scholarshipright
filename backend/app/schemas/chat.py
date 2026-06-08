from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID


class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: Optional[str] = None


class ChatSessionCreate(BaseModel):
    pass


class ChatSessionResponse(BaseModel):
    id: UUID
    user_id: UUID
    messages: List[ChatMessage] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatMessageRequest(BaseModel):
    message: str


class MatchScoreResponse(BaseModel):
    score: float
    breakdown: dict

    class Config:
        from_attributes = True
