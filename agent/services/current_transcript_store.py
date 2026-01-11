"""
In-memory store for current conversation transcripts.
Allows the API server to access transcripts from active sessions
before they are saved to the database.
"""
from typing import Dict, Any, Optional
from datetime import datetime
import asyncio

from config import logger

# Global in-memory store: {user_id: transcript_dict}
_current_transcripts: Dict[int, Dict[str, Any]] = {}
_lock = asyncio.Lock()


async def set_current_transcript(user_id: int, transcript: Dict[str, Any]) -> None:
    """
    Store the current transcript for a user.
    Called by the agent during an active session.
    """
    async with _lock:
        _current_transcripts[user_id] = transcript
        logger.debug(
            "Stored current transcript for user %s (items: %s)",
            user_id,
            len(transcript.get("messages", transcript.get("items", []))),
        )


async def get_current_transcript(user_id: int) -> Optional[Dict[str, Any]]:
    """
    Get the current transcript for a user.
    Returns None if no active transcript exists.
    """
    async with _lock:
        return _current_transcripts.get(user_id)


async def remove_current_transcript(user_id: int) -> None:
    """
    Remove the current transcript for a user.
    Called after the transcript is saved to the database.
    """
    async with _lock:
        if user_id in _current_transcripts:
            del _current_transcripts[user_id]
            logger.debug("Removed current transcript for user %s", user_id)

