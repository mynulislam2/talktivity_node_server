"""
Transcript saving service.
Handles session transcript persistence and usage tracking.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

from database import (
    DatabasePool,
    TranscriptRepository,
    UsageRepository,
    CourseRepository,
    TranscriptData,
    UsageRecord,
)
from config import (
    SUPPORTED_SESSION_TYPES,
    CALL_LIFETIME_LIMIT_SECONDS,
    PRACTICE_DAILY_CAP_SECONDS,
    ROLEPLAY_BASIC_CAP_SECONDS,
    ROLEPLAY_PRO_CAP_SECONDS,
    PLAN_TYPE_PRO,
)
from utils.timezone import get_utc_now, get_utc_today

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
        duration_seconds: int,
        session_info: Optional[Dict[str, Any]] = None
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
            
            # Route by session type
            if session_type == "call":
                # For call sessions, insert into call_sessions table (ONLY at end)
                call_save_success = await self._save_call_session(
                    user_id, room_name, session_type, duration_seconds, session_info
                )
                if not call_save_success:
                    logger.warning("Failed to save call session (transcript saved successfully)")
                    # Don't fail the whole operation if call session save fails
            elif session_type == "practice":
                # Practice sessions: update daily_progress speaking_* fields directly (daily caps)
                try:
                    await self._update_daily_progress_for_practice(
                        user_id=user_id,
                        duration_seconds=duration_seconds,
                    )
                except Exception as e:
                    logger.warning(f"Failed to update daily_progress for practice: {e}")
            elif session_type == "roleplay":
                # Roleplay sessions: update daily_progress roleplay_* fields directly (daily caps)
                try:
                    await self._update_daily_progress_for_roleplay(
                        user_id=user_id,
                        duration_seconds=duration_seconds,
                    )
                except Exception as e:
                    logger.warning(f"Failed to update daily_progress for roleplay: {e}")
            
            logger.info(
                f"✅ Successfully saved transcript for user {user_id} "
                f"(session_type={session_type}, duration={duration_seconds}s)"
            )
            return True
            
        except Exception as e:
            logger.error(f"Error saving session transcript: {e}", exc_info=True)
            return False
    
    async def _save_call_session(
        self,
        user_id: int,
        room_name: str,
        session_type: str,
        duration_seconds: int,
        session_info: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Save call session to call_sessions table (ONLY at end, with all details).
        Also updates user_lifecycle.call_completed for routing.
        
        Args:
            user_id: User ID
            room_name: Room name
            session_type: Session type (should be "call")
            duration_seconds: Session duration in seconds
            session_info: Session info dictionary containing call_start_time
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get call start time from memory
            if session_info and "call_start_time" in session_info:
                call_started_at = session_info["call_start_time"]
            else:
                # Fallback: use current time minus duration
                call_started_at = get_utc_now() - timedelta(seconds=duration_seconds)

            # Normalize to naive UTC datetimes for TIMESTAMP columns in Postgres
            if isinstance(call_started_at, datetime) and call_started_at.tzinfo is not None:
                call_started_at = call_started_at.replace(tzinfo=None)

            call_ended_at = get_utc_now()
            if isinstance(call_ended_at, datetime) and call_ended_at.tzinfo is not None:
                call_ended_at = call_ended_at.replace(tzinfo=None)
            
            # Extract topic info from session_info if available
            topic_name = session_info.get("topic_name") if session_info else None
            topic_id = session_info.get("topic_id") if session_info else None
            
            async with self.db.acquire() as conn:
                # First, check total lifetime duration from existing sessions
                total_result = await conn.fetchrow(
                    """
                    SELECT COALESCE(SUM(call_duration_seconds), 0) as total
                    FROM call_sessions
                    WHERE user_id = $1
                    """,
                    user_id
                )
                total_before = total_result["total"] if total_result else 0
                total_after = total_before + duration_seconds
                
                # Insert new session record with all details
                await conn.execute(
                    """
                    INSERT INTO call_sessions 
                    (user_id, call_started_at, call_ended_at, call_duration_seconds, 
                     session_type, room_name, topic_name, topic_id, call_completed)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """,
                    user_id,
                    call_started_at,
                    call_ended_at,
                    duration_seconds,
                    session_type,
                    room_name,
                    topic_name,
                    topic_id,
                    total_after >= CALL_LIFETIME_LIMIT_SECONDS  # Set call_completed if lifetime limit reached
                )
            
            logger.info(
                f"✅ Saved call session for user {user_id}: "
                f"duration={duration_seconds}s, total_lifetime={total_after}s, "
                f"call_completed={total_after >= CALL_LIFETIME_LIMIT_SECONDS}"
            )
            
            # Update daily_progress for call sessions
            # Set speaking_started_at if not set, and mark completed if lifetime limit reached
            await self._update_daily_progress_for_call(
                user_id, call_started_at, call_ended_at, duration_seconds, 
                total_after >= CALL_LIFETIME_LIMIT_SECONDS
            )
            
            # Always update user_lifecycle.call_completed (for routing, regardless of duration)
            # Direct database update instead of API call
            await self._update_lifecycle_call_completed(user_id)
            
            return True
            
        except Exception as e:
            logger.error(f"Error saving call session: {e}", exc_info=True)
            return False
    
    async def _update_daily_progress_for_call(
        self, user_id: int, call_started_at: datetime, call_ended_at: datetime,
        duration_seconds: int, lifetime_limit_reached: bool
    ) -> bool:
        """
        Update daily_progress for call sessions.
        Sets speaking_started_at if not set, and marks completed if lifetime limit reached.
        Always recalculates week_number and day_number based on current date.
        
        Args:
            user_id: User ID
            call_started_at: When the call session started
            call_ended_at: When the call session ended
            duration_seconds: Duration of this call session
            lifetime_limit_reached: Whether lifetime limit (5 min) is reached
            
        Returns:
            True if successful, False otherwise
        """
        try:
            today_date = get_utc_today()
            
            async with self.db.acquire() as conn:
                # Get active course to calculate week/day
                course = await conn.fetchrow(
                    """
                    SELECT id, course_start_date
                    FROM user_courses
                    WHERE user_id = $1 AND is_active = true
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    user_id
                )
                
                if not course:
                    logger.warning(f"No active course found for user {user_id}, skipping daily_progress update")
                    return False
                
                # Calculate week and day numbers based on today's date
                # Ensure both dates are date objects (no time component)
                course_start = course["course_start_date"]
                if isinstance(course_start, datetime):
                    course_start = course_start.date()
                elif isinstance(course_start, str):
                    # Handle string dates (YYYY-MM-DD)
                    course_start = dt.strptime(course_start.split('T')[0], '%Y-%m-%d').date()
                
                # Ensure today_date is a date object (no time component)
                if isinstance(today_date, datetime):
                    today_date = today_date.date()
                
                days_since_start = (today_date - course_start).days
                if days_since_start < 0:
                    days_since_start = 0
                
                week_number = (days_since_start // 7) + 1
                day_number = (days_since_start % 7) + 1
                
                # Check if daily_progress exists and get current state
                existing = await conn.fetchrow(
                    """
                    SELECT speaking_started_at, speaking_duration_seconds, speaking_completed
                    FROM daily_progress
                    WHERE user_id = $1 AND progress_date = $2
                    """,
                    user_id,
                    today_date
                )
                
                # Determine started_at (preserve existing or use call start time)
                started_at_value = None
                if existing and existing["speaking_started_at"]:
                    started_at_value = existing["speaking_started_at"]
                else:
                    started_at_value = call_started_at
                
                # Calculate total speaking time (existing + this call)
                existing_duration = int(existing["speaking_duration_seconds"]) if existing and existing["speaking_duration_seconds"] else 0
                total_duration = existing_duration + duration_seconds
                
                # Mark completed if lifetime limit reached (5 minutes = 300 seconds)
                should_mark_completed = lifetime_limit_reached or (existing and existing["speaking_completed"])
                
                # Upsert daily_progress (always update week_number and day_number)
                await conn.execute(
                    """
                    INSERT INTO daily_progress (
                        user_id, course_id, week_number, day_number, progress_date,
                        speaking_started_at, speaking_ended_at, speaking_duration_seconds,
                        speaking_completed
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (user_id, progress_date) DO UPDATE SET
                        course_id = EXCLUDED.course_id,
                        week_number = EXCLUDED.week_number,
                        day_number = EXCLUDED.day_number,
                        speaking_started_at = COALESCE(
                            daily_progress.speaking_started_at,
                            EXCLUDED.speaking_started_at
                        ),
                        speaking_ended_at = EXCLUDED.speaking_ended_at,
                        speaking_duration_seconds = GREATEST(
                            daily_progress.speaking_duration_seconds,
                            EXCLUDED.speaking_duration_seconds
                        ),
                        speaking_completed = CASE
                            WHEN EXCLUDED.speaking_completed = true THEN true
                            ELSE daily_progress.speaking_completed
                        END,
                        updated_at = (NOW() AT TIME ZONE 'UTC')
                    """,
                    user_id,
                    course["id"],
                    week_number,
                    day_number,
                    today_date,
                    started_at_value,
                    call_ended_at,
                    total_duration,
                    should_mark_completed,
                )
                
                logger.info(
                    f"✅ Updated daily_progress for call session (user {user_id}): "
                    f"started_at={started_at_value}, duration={total_duration}s, "
                    f"completed={should_mark_completed}"
                )
                return True
                
        except Exception as e:
            logger.error(f"Error updating daily_progress for call: {e}", exc_info=True)
            return False

    async def _update_daily_progress_for_practice(
        self,
        user_id: int,
        duration_seconds: int,
    ) -> bool:
        """
        Update daily_progress for practice (speaking) sessions.
        Uses per-day accumulated speaking_duration_seconds and plan-based daily caps.
        """
        try:
            today_date = get_utc_today()

            async with self.db.acquire() as conn:
                # Get active course
                course = await conn.fetchrow(
                    """
                    SELECT id, course_start_date
                    FROM user_courses
                    WHERE user_id = $1 AND is_active = true
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    user_id,
                )
                if not course:
                    logger.warning(f"No active course found for user {user_id}, skipping practice daily_progress update")
                    return False

                # Compute week/day from course_start_date and today
                course_start = course["course_start_date"]
                if isinstance(course_start, datetime):
                    course_start = course_start.date()
                days_since_start = (today_date - course_start).days
                if days_since_start < 0:
                    days_since_start = 0
                week_number = (days_since_start // 7) + 1
                day_number = (days_since_start % 7) + 1

                # Get existing daily_progress row
                existing = await conn.fetchrow(
                    """
                    SELECT speaking_started_at, speaking_duration_seconds, speaking_completed
                    FROM daily_progress
                    WHERE user_id = $1 AND progress_date = $2
                    """,
                    user_id,
                    today_date,
                )

                # Determine started_at (preserve existing earliest), normalize to naive UTC
                started_at_value = existing["speaking_started_at"] if existing and existing["speaking_started_at"] else get_utc_now()
                if isinstance(started_at_value, datetime) and started_at_value.tzinfo is not None:
                    started_at_value = started_at_value.replace(tzinfo=None)

                # Accumulate duration
                existing_duration = int(existing["speaking_duration_seconds"] or 0) if existing else 0
                total_duration = existing_duration + duration_seconds
                # Determine if daily cap has been reached for practice
                should_mark_completed = bool(existing and existing["speaking_completed"])
                if total_duration >= PRACTICE_DAILY_CAP_SECONDS:
                    should_mark_completed = True

                await conn.execute(
                    """
                    INSERT INTO daily_progress (
                        user_id, course_id, week_number, day_number, progress_date,
                        speaking_started_at, speaking_ended_at, speaking_duration_seconds,
                        speaking_completed
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, (NOW() AT TIME ZONE 'UTC'), $7, $8)
                    ON CONFLICT (user_id, progress_date) DO UPDATE SET
                        course_id = EXCLUDED.course_id,
                        week_number = EXCLUDED.week_number,
                        day_number = EXCLUDED.day_number,
                        speaking_started_at = COALESCE(
                            daily_progress.speaking_started_at,
                            EXCLUDED.speaking_started_at
                        ),
                        speaking_ended_at = EXCLUDED.speaking_ended_at,
                        speaking_duration_seconds = GREATEST(
                            daily_progress.speaking_duration_seconds,
                            EXCLUDED.speaking_duration_seconds
                        ),
                        speaking_completed = daily_progress.speaking_completed
                            OR EXCLUDED.speaking_completed,
                        updated_at = (NOW() AT TIME ZONE 'UTC')
                    """,
                    user_id,
                    course["id"],
                    week_number,
                    day_number,
                    today_date,
                    started_at_value,
                    total_duration,
                    should_mark_completed,
                )

                logger.info(
                    f"✅ Updated daily_progress for practice session (user {user_id}): "
                    f"duration_today={total_duration}s"
                )
                return True
        except Exception as e:
            logger.error(f"Error updating daily_progress for practice: {e}", exc_info=True)
            return False

    async def _update_daily_progress_for_roleplay(
        self,
        user_id: int,
        duration_seconds: int,
    ) -> bool:
        """
        Update daily_progress for roleplay sessions.
        Uses per-day accumulated roleplay_duration_seconds and plan-based daily caps.
        """
        try:
            today_date = get_utc_today()

            async with self.db.acquire() as conn:
                # Get active course
                course = await conn.fetchrow(
                    """
                    SELECT id, course_start_date
                    FROM user_courses
                    WHERE user_id = $1 AND is_active = true
                    ORDER BY id DESC
                    LIMIT 1
                    """,
                    user_id,
                )
                if not course:
                    logger.warning(f"No active course found for user {user_id}, skipping roleplay daily_progress update")
                    return False

                # Compute week/day
                course_start = course["course_start_date"]
                if isinstance(course_start, datetime):
                    course_start = course_start.date()
                days_since_start = (today_date - course_start).days
                if days_since_start < 0:
                    days_since_start = 0
                week_number = (days_since_start // 7) + 1
                day_number = (days_since_start % 7) + 1

                # Existing row
                existing = await conn.fetchrow(
                    """
                    SELECT roleplay_started_at, roleplay_duration_seconds, roleplay_completed
                    FROM daily_progress
                    WHERE user_id = $1 AND progress_date = $2
                    """,
                    user_id,
                    today_date,
                )

                started_at_value = existing["roleplay_started_at"] if existing and existing["roleplay_started_at"] else get_utc_now()
                if isinstance(started_at_value, datetime) and started_at_value.tzinfo is not None:
                    started_at_value = started_at_value.replace(tzinfo=None)
                existing_duration = int(existing["roleplay_duration_seconds"] or 0) if existing else 0
                total_duration = existing_duration + duration_seconds

                # Determine daily cap based on subscription plan (Basic/FreeTrial vs Pro)
                roleplay_cap = ROLEPLAY_BASIC_CAP_SECONDS
                # Try to look up subscription plan; on failure, default to basic cap
                try:
                    from database import SubscriptionRepository  # local import to avoid cycles

                    sub_repo = SubscriptionRepository(self.db)
                    sub = await sub_repo.get_active_subscription(user_id)
                    if sub and sub.plan_type == PLAN_TYPE_PRO:
                        roleplay_cap = ROLEPLAY_PRO_CAP_SECONDS
                except Exception as cap_err:
                    logger.warning(
                        f"Failed to determine roleplay cap from subscription for user {user_id}: {cap_err}"
                    )

                should_mark_completed = bool(existing and existing["roleplay_completed"])
                if total_duration >= roleplay_cap:
                    should_mark_completed = True

                await conn.execute(
                    """
                    INSERT INTO daily_progress (
                        user_id, course_id, week_number, day_number, progress_date,
                        roleplay_started_at, roleplay_ended_at, roleplay_duration_seconds,
                        roleplay_completed
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, (NOW() AT TIME ZONE 'UTC'), $7, $8)
                    ON CONFLICT (user_id, progress_date) DO UPDATE SET
                        course_id = EXCLUDED.course_id,
                        week_number = EXCLUDED.week_number,
                        day_number = EXCLUDED.day_number,
                        roleplay_started_at = COALESCE(
                            daily_progress.roleplay_started_at,
                            EXCLUDED.roleplay_started_at
                        ),
                        roleplay_ended_at = EXCLUDED.roleplay_ended_at,
                        roleplay_duration_seconds = GREATEST(
                            daily_progress.roleplay_duration_seconds,
                            EXCLUDED.roleplay_duration_seconds
                        ),
                        roleplay_completed = daily_progress.roleplay_completed
                            OR EXCLUDED.roleplay_completed,
                        updated_at = (NOW() AT TIME ZONE 'UTC')
                    """,
                    user_id,
                    course["id"],
                    week_number,
                    day_number,
                    today_date,
                    started_at_value,
                    total_duration,
                    should_mark_completed,
                )

                logger.info(
                    f"✅ Updated daily_progress for roleplay session (user {user_id}): "
                    f"duration_today={total_duration}s"
                )
                return True
        except Exception as e:
            logger.error(f"Error updating daily_progress for roleplay: {e}", exc_info=True)
            return False
    
    async def _update_lifecycle_call_completed(self, user_id: int) -> bool:
        """
        Update user_lifecycle.call_completed directly in database (for routing).
        
        Args:
            user_id: User ID
            
        Returns:
            True if successful, False otherwise
        """
        try:
            async with self.db.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE user_lifecycle
                    SET call_completed = true,
                        updated_at = (NOW() AT TIME ZONE 'UTC')
                    WHERE user_id = $1
                    """,
                    user_id
                )
                logger.info(f"✅ Updated lifecycle.call_completed for user {user_id} (direct DB update)")
                return True
        except Exception as e:
            logger.error(f"Error updating lifecycle.call_completed: {e}")
            return False