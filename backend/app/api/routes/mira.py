"""
MIRA Conversational AI Assistant API Routes
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from app.api.routes.recommendations import get_recommendation_service
from app.schemas.recommendations import (
    MiraChatRequest,
    MiraChatResponse,
    MiraSessionHistoryResponse,
)
from app.services.mira_service import MiraService

router = APIRouter(prefix="/api/mira", tags=["MIRA Assistant"])


def get_mira_service(request: Request) -> MiraService:
    svc = getattr(request.app.state, "mira_service", None)
    if svc is None:
        rec_svc = get_recommendation_service(request)
        svc = MiraService(recommendation_service=rec_svc)
        request.app.state.mira_service = svc
    return svc


@router.post("/chat", response_model=MiraChatResponse)
async def chat_with_mira(
    payload: MiraChatRequest,
    service: MiraService = Depends(get_mira_service),
) -> MiraChatResponse:
    return await service.chat(payload)


@router.get("/history", response_model=MiraSessionHistoryResponse)
async def get_mira_history(
    session_id: str = Query(default="default-mira-session", max_length=100),
    user_id: str = Query(default="local-default", max_length=100),
    service: MiraService = Depends(get_mira_service),
) -> MiraSessionHistoryResponse:
    return service.get_history(session_id=session_id, user_id=user_id)


@router.delete("/history")
async def clear_mira_history(
    session_id: str = Query(default="default-mira-session", max_length=100),
    user_id: str = Query(default="local-default", max_length=100),
    service: MiraService = Depends(get_mira_service),
) -> dict[str, bool]:
    service.clear_history(session_id=session_id, user_id=user_id)
    return {"cleared": True}
