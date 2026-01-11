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
# Event-based waiting: {user_id: asyncio.Event} - signals when transcript is available
_transcript_events: Dict[int, asyncio.Event] = {}
_lock = asyncio.Lock()


async def set_current_transcript(user_id: int, transcript: Dict[str, Any]) -> None:
    """
    Store the current transcript for a user.
    Called by the agent during an active session.
    Signals any waiting API requests that the transcript is now available.
    """
    async with _lock:
        _current_transcripts[user_id] = transcript
        
        # Create or get event for this user and signal it
        if user_id not in _transcript_events:
            _transcript_events[user_id] = asyncio.Event()
        _transcript_events[user_id].set()
        
        logger.debug(
            "Stored current transcript for user %s (items: %s) - signaled waiting requests",
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


async def wait_for_transcript(
    user_id: int, 
    timeout: float = 120.0,
    check_interval: float = 0.1
) -> Optional[Dict[str, Any]]:
    """
    Wait for transcript to become available using async/await (not retries).
    Uses asyncio.Event for efficient waiting - blocks until transcript is available.
    This will wait until the conversation is complete and transcript is ready.
    
    Args:
        user_id: User ID to wait for
        timeout: Maximum time to wait in seconds (default: 120 seconds / 2 minutes)
        check_interval: How often to check if transcript exists (default: 0.1 seconds)
    
    Returns:
        Transcript dict if available, None if timeout or not found
    """
    # First check if it's already available
    transcript = await get_current_transcript(user_id)
    if transcript:
        messages = transcript.get("messages", transcript.get("items", []))
        if messages and len(messages) > 0:
            logger.info(
                "✅ Transcript immediately available for user %s (items: %s)",
                user_id,
                len(messages),
            )
            return transcript
    
    # Not available yet - wait for it using event-based waiting
    async with _lock:
        # Get or create event for this user
        if user_id not in _transcript_events:
            _transcript_events[user_id] = asyncio.Event()
        event = _transcript_events[user_id]
        # Clear event if it was already set (from previous storage that might be stale)
        if event.is_set():
            event.clear()
    
    logger.info(
        "⏳ Waiting for transcript to become available for user %s (timeout: %s seconds)...",
        user_id,
        timeout,
    )
    
    try:
        # Wait for event to be set (transcript becomes available)
        # This is efficient - uses asyncio.Event which blocks until signaled
        await asyncio.wait_for(event.wait(), timeout=timeout)
        
        # Event was signaled - wait a tiny bit to ensure transcript is fully stored
        # This handles race conditions where event fires but storage isn't complete yet
        await asyncio.sleep(0.1)
        
        # Verify transcript is actually available (with polling fallback)
        # Sometimes event fires but transcript isn't ready yet due to async operations
        max_verification_attempts = 10  # 10 attempts = 1 second max
        for verify_attempt in range(max_verification_attempts):
            transcript = await get_current_transcript(user_id)
            if transcript:
                messages = transcript.get("messages", transcript.get("items", []))
                if messages and len(messages) > 0:
                    logger.info(
                        "✅ Transcript became available for user %s after waiting (items: %s, verified on attempt %s)",
                        user_id,
                        len(messages),
                        verify_attempt + 1,
                    )
                    return transcript
            
            # If not ready yet, wait a bit more (event was signaled but storage might be in progress)
            if verify_attempt < max_verification_attempts - 1:
                await asyncio.sleep(0.1)
        
        # Event was signaled but transcript still not ready after verification attempts
        logger.warning(
            "⚠️ Event was signaled but transcript not ready after verification for user %s",
            user_id,
        )
        
    except asyncio.TimeoutError:
        logger.warning(
            "⏱️ Timeout waiting for transcript for user %s (waited %s seconds)",
            user_id,
            timeout,
        )
        # Final check - maybe it was set just before timeout
        transcript = await get_current_transcript(user_id)
        if transcript:
            messages = transcript.get("messages", transcript.get("items", []))
            if messages and len(messages) > 0:
                logger.info(
                    "✅ Transcript found on final check for user %s (items: %s)",
                    user_id,
                    len(messages),
                )
                return transcript
    
    return None


async def remove_current_transcript(user_id: int) -> None:
    """
    Remove the current transcript for a user.
    Called after the transcript is saved to the database.
    Also cleans up the event.
    """
    async with _lock:
        if user_id in _current_transcripts:
            del _current_transcripts[user_id]
        # Clean up event
        if user_id in _transcript_events:
            # Reset event for next time
            _transcript_events[user_id].clear()
            # Optionally remove event to free memory (or keep for reuse)
            # del _transcript_events[user_id]
        logger.debug("Removed current transcript for user %s", user_id)

