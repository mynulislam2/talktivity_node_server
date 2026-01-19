import json
from datetime import datetime

from config import logger
from db import (
    save_test_call_usage,
    save_transcript_by_device_id,
    save_transcript_to_postgres,
    record_session_usage,
    update_course_speaking_progress,
)


async def save_session_transcript(
    *,
    session,
    ctx,
    participant,
    session_type: str,
    session_start_time: datetime,
) -> bool:
    """
    Persist a finished session transcript to PostgreSQL.

    This is extracted from the original minimal_assistant.write_transcript closure
    so it can be reused from other entrypoints or APIs.
    
    Returns:
        True if transcript was saved successfully, False otherwise.
    """
    try:
        transcript_data = session.history.to_dict()
    except Exception as e:
        logger.error("Error getting transcript data from session: %s", e)
        return False

    # Calculate session duration once
    duration_seconds = int((datetime.utcnow() - session_start_time).total_seconds())
    if duration_seconds < 0:
        duration_seconds = 0

    user_id: int | None = None
    if participant.identity.startswith("user_"):
        try:
            user_id = int(participant.identity.replace("user_", ""))
        except ValueError:
            user_id = None

    # Track test call usage lifetime per user (5 minutes total across sessions)
    if session_type == "test" and user_id:
        try:
            await save_test_call_usage(user_id, duration_seconds)
        except Exception as e:
            logger.error("Error saving test call usage: %s", e)
            # Don't fail the whole save for usage tracking errors

    # Save to PostgreSQL based on participant identity type
    save_success = False
    try:
        room_name = getattr(ctx.room, "name", "console") if hasattr(ctx, "room") else "console"
        
        if user_id is not None:
            # Save to conversations table for user_X format
            save_success = await save_transcript_to_postgres(
                room_name=room_name,
                participant_identity=participant.identity,
                transcript_data=transcript_data,
            )
            if not save_success:
                logger.warning(
                    "Failed to save transcript for user %s in room %s",
                    participant.identity,
                    room_name,
                )
        else:
            # Save to device_conversations table for other formats (like finger_xxx)
            try:
                save_success = await save_transcript_by_device_id(
                    room_name=room_name,
                    device_id=participant.identity,
                    transcript_data=transcript_data,
                )
                if not save_success:
                    logger.warning(
                        "Failed to save transcript for device_id %s in room %s",
                        participant.identity,
                        room_name,
                    )
            except Exception as e:
                logger.error(
                    "Unexpected error while saving transcript for device_id %s: %s",
                    participant.identity,
                    e,
                )
                save_success = False
    except Exception as e:
        logger.error("Could not save transcript: %s", e)
        save_success = False

    # Record usage for supported session types (call/practice/roleplay)
    if user_id is not None and session_type in {"call", "practice", "roleplay"}:
        try:
            await record_session_usage(user_id, session_type, duration_seconds)
        except Exception as e:
            logger.error("Failed to record session usage for user %s: %s", user_id, e)

    # Course speaking progress: update on session end (server-authoritative)
    # We use today's totals in daily_usage (practice + roleplay) to determine completion.
    if user_id is not None and session_type in {"practice", "roleplay"}:
        try:
            await update_course_speaking_progress(user_id)
        except Exception as e:
            logger.error("Failed to update course speaking progress for user %s: %s", user_id, e)

    return save_success
