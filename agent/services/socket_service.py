"""
Socket service for emitting session state events to Node.js server.
Uses HTTP POST to Node.js which then broadcasts via Socket.IO to the frontend.
"""

import httpx
import logging
from typing import Optional

from config import SESSION_STATE_SAVING, SESSION_STATE_SAVED, SESSION_STATE_FAILED

logger = logging.getLogger(__name__)


async def emit_session_state(
    user_id: int,
    state: str,
    api_url: str,
    call_id: Optional[str] = None,
    message: Optional[str] = None,
) -> bool:
    """
    Emit session state event via Node.js server Socket.IO.
    
    This sends an HTTP POST to the Node.js server, which then broadcasts
    the event to the user's connected Socket.IO client.
    
    Args:
        user_id: User ID to send the event to
        state: Session state - one of:
            - "SAVING_CONVERSATION" - Emitted when call ends, before DB save
            - "SESSION_SAVED" - Emitted after successful DB save
            - "SESSION_SAVE_FAILED" - Emitted if DB save fails
        api_url: Node.js API server URL
        call_id: Optional call/room identifier
        message: Optional message to display to user
        
    Returns:
        True if event was successfully sent to Node.js server, False otherwise
    """
    try:
        payload = {
            "user_id": user_id,
            "state": state,
            "call_id": call_id,
            "message": message,
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{api_url}/api/agent/session-state",
                json=payload,
                timeout=5.0,
            )
            
            if response.status_code == 200:
                logger.info(
                    "✅ Emitted session state '%s' for user %s (call_id=%s)",
                    state,
                    user_id,
                    call_id,
                )
                return True
            else:
                logger.warning(
                    "⚠️ Failed to emit session state '%s' for user %s: %s",
                    state,
                    user_id,
                    response.text,
                )
                return False
                
    except Exception as e:
        logger.error(
            "❌ Error emitting session state '%s' for user %s: %s",
            state,
            user_id,
            e,
        )
        return False


async def emit_saving_conversation(
    user_id: int,
    api_url: str,
    call_id: Optional[str] = None,
) -> bool:
    """
    Emit SAVING_CONVERSATION state - call this immediately when call ends.
    Frontend will show a loader with "Saving your conversation..." message.
    """
    return await emit_session_state(
        user_id=user_id,
        state=SESSION_STATE_SAVING,
        api_url=api_url,
        call_id=call_id,
        message="Please wait a moment, we are saving your conversation for analysis…",
    )


async def emit_session_saved(
    user_id: int,
    api_url: str,
    call_id: Optional[str] = None,
) -> bool:
    """
    Emit SESSION_SAVED state - call this after successful DB save.
    Frontend will stop the loader and navigate to completion page.
    """
    return await emit_session_state(
        user_id=user_id,
        state=SESSION_STATE_SAVED,
        api_url=api_url,
        call_id=call_id,
        message="Conversation saved successfully!",
    )


async def emit_session_save_failed(
    user_id: int,
    api_url: str,
    call_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> bool:
    """
    Emit SESSION_SAVE_FAILED state - call this if DB save fails.
    Frontend will show an error and allow retry options.
    """
    return await emit_session_state(
        user_id=user_id,
        state=SESSION_STATE_FAILED,
        api_url=api_url,
        call_id=call_id,
        message=error_message or "Failed to save conversation. Please try again.",
    )


__all__ = [
    "emit_session_state",
    "emit_saving_conversation",
    "emit_session_saved",
    "emit_session_save_failed",
    "SESSION_STATE_SAVING",
    "SESSION_STATE_SAVED",
    "SESSION_STATE_FAILED",
]
