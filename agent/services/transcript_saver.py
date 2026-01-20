"""
Transcript saving service.
Handles session transcript persistence and usage tracking.
"""

import logging
from datetime import datetime
from typing import Dict, Any

from database import (
    DatabasePool,
    TranscriptRepository,
    UsageRepository,
    CourseRepository,
    TranscriptData,
    UsageRecord,
)
from config import SUPPORTED_SESSION_TYPES

logger = logging.getLogger(__name__)


class TranscriptService:
    """Service for saving session transcripts and tracking usage."""
    
    def __init__(self, db: DatabasePool):
        self.db = db
        self.transcript_repo = TranscriptRepository(db)
        self.usage_repo = UsageRepository(db)
        self.course_repo = CourseRepository(db)
    
    async def save_session_transcript(
        self,
        user_id: int,
        room_name: str,
        session_type: str,
        transcript: Dict[str, Any],
        duration_seconds: int
    ) -> bool:
        """
        Save session transcript and update usage tracking.
        
        Args:
            user_id: User ID
            room_name: Room/session name
            session_type: Type of session ("call", "practice", "roleplay")
            transcript: Transcript data dictionary
            duration_seconds: Session duration in seconds
            
        Returns:
            True if successful, False otherwise
        """
        # Validate session type
        session_type = session_type.lower()
        if session_type not in SUPPORTED_SESSION_TYPES:
            logger.warning(f"Unsupported session type: {session_type}")
            return False
        
        try:
            # Save transcript
            transcript_data = TranscriptData(
                room_name=room_name,
                user_id=user_id,
                session_type=session_type,
                transcript=transcript,
                duration_seconds=duration_seconds,
            )
            
            save_success = await self.transcript_repo.save(transcript_data)
            if not save_success:
                logger.error("Failed to save transcript to database")
                return False
            
            # Record usage
            usage = UsageRecord(
                user_id=user_id,
                session_type=session_type,
                duration_seconds=duration_seconds,
            )
            
            usage_success = await self.usage_repo.record_usage(usage)
            if not usage_success:
                logger.warning("Failed to record usage (transcript saved successfully)")
                # Don't fail the whole operation if usage tracking fails
            
            # Update course progress for practice/roleplay
            if session_type in {"practice", "roleplay"}:
                try:
                    await self.course_repo.update_speaking_progress(user_id)
                except Exception as e:
                    logger.warning(f"Failed to update course progress: {e}")
                    # Don't fail if course update fails
            
            logger.info(
                f"✅ Successfully saved transcript for user {user_id} "
                f"(session_type={session_type}, duration={duration_seconds}s)"
            )
            return True
            
        except Exception as e:
            logger.error(f"Error saving session transcript: {e}", exc_info=True)
            return False
