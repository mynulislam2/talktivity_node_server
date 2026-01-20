"""
Data access layer for database operations.
Separates SQL queries from business logic.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from database.connection import DatabasePool
from database.models import UserProfile, TranscriptData, UsageRecord, Subscription
from config import (
    CALL_LIFETIME_LIMIT_SECONDS,
    PRACTICE_DAILY_CAP_SECONDS,
    ROLEPLAY_BASIC_CAP_SECONDS,
    ROLEPLAY_PRO_CAP_SECONDS,
    PLAN_TYPE_PRO,
    PLAN_TYPE_BASIC,
    PLAN_TYPE_FREE_TRIAL,
    SPEAKING_COMPLETION_THRESHOLD_SECONDS,
)

logger = logging.getLogger(__name__)


class UserRepository:
    """Repository for user-related database operations."""
    
    def __init__(self, db: DatabasePool):
        self.db = db
    
    async def get_profile(self, user_id: int) -> Optional[UserProfile]:
        """
        Fetch user onboarding profile.
        
        Args:
            user_id: User ID
            
        Returns:
            UserProfile if found, None otherwise
        """
        try:
            async with self.db.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT * FROM onboarding_data WHERE user_id = $1",
                    user_id
                )
                
                if row:
                    return UserProfile.from_db_row(dict(row))
                return None
                
        except Exception as e:
            logger.error(f"Failed to fetch user profile for user {user_id}: {e}")
            return None


class TranscriptRepository:
    """Repository for transcript-related database operations."""
    
    def __init__(self, db: DatabasePool):
        self.db = db
    
    async def save(self, transcript: TranscriptData) -> bool:
        """
        Save conversation transcript to database.
        
        Args:
            transcript: Transcript data to save
            
        Returns:
            True if successful, False otherwise
        """
        try:
            async with self.db.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO conversations (user_id, transcript, room_name, session_duration, timestamp)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    transcript.user_id,
                    json.dumps(transcript.transcript),
                    transcript.room_name,
                    transcript.duration_seconds,
                    transcript.timestamp,
                )
            
            logger.info(
                f"✅ Saved transcript for user {transcript.user_id} (room={transcript.room_name}, duration={transcript.duration_seconds}s)"
            )
            return True
            
        except Exception as e:
            logger.error(f"Failed to save transcript: {e}", exc_info=True)
            return False


class UsageRepository:
    """Repository for usage tracking operations."""
    
    def __init__(self, db: DatabasePool):
        self.db = db
    
    async def record_usage(self, usage: UsageRecord) -> bool:
        """
        Record session usage in database.
        
        Args:
            usage: Usage record to save
            
        Returns:
            True if successful, False otherwise
        """
        try:
            session_type = usage.session_type.lower()
            
            # Call sessions go to lifetime_call_usage
            if session_type == "call":
                async with self.db.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO lifetime_call_usage (user_id, duration_seconds)
                        VALUES ($1, $2)
                        """,
                        usage.user_id,
                        usage.duration_seconds,
                    )
                logger.info(
                    f"✅ Recorded call usage for user {usage.user_id}: {usage.duration_seconds}s"
                )
                return True
            
            # Practice/roleplay go to daily_usage
            if session_type not in {"practice", "roleplay"}:
                logger.warning(f"Unknown session type: {session_type}")
                return False
            
            column = "practice_time_seconds" if session_type == "practice" else "roleplay_time_seconds"
            
            async with self.db.acquire() as conn:
                await conn.execute(
                    f"""
                    INSERT INTO daily_usage (user_id, usage_date, {column}, total_time_seconds)
                    VALUES ($1, $2, $3, $3)
                    ON CONFLICT (user_id, usage_date) DO UPDATE
                    SET {column} = daily_usage.{column} + $3,
                        total_time_seconds = daily_usage.total_time_seconds + $3,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    usage.user_id,
                    usage.usage_date,
                    usage.duration_seconds,
                )
            
            logger.info(
                f"✅ Recorded {session_type} usage for user {usage.user_id}: {usage.duration_seconds}s"
            )
            return True
            
        except Exception as e:
            logger.error(f"Failed to record usage: {e}", exc_info=True)
            return False
    
    async def get_lifetime_call_usage(self, user_id: int) -> int:
        """
        Get total lifetime call usage for user.
        
        Args:
            user_id: User ID
            
        Returns:
            Total seconds used
        """
        try:
            async with self.db.acquire() as conn:
                result = await conn.fetchrow(
                    """
                    SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds
                    FROM lifetime_call_usage
                    WHERE user_id = $1
                    """,
                    user_id
                )
                return result["total_seconds"] if result else 0
                
        except Exception as e:
            logger.error(f"Failed to get lifetime call usage: {e}")
            return 0
    
    async def get_daily_usage(self, user_id: int, date: datetime) -> Dict[str, int]:
        """
        Get daily usage for user on specific date.
        
        Args:
            user_id: User ID
            date: Date to check
            
        Returns:
            Dictionary with practice_time_seconds and roleplay_time_seconds
        """
        try:
            async with self.db.acquire() as conn:
                result = await conn.fetchrow(
                    """
                    SELECT practice_time_seconds, roleplay_time_seconds
                    FROM daily_usage
                    WHERE user_id = $1 AND usage_date = $2
                    """,
                    user_id,
                    date.date() if isinstance(date, datetime) else date
                )
                
                if result:
                    return {
                        "practice_time_seconds": result["practice_time_seconds"] or 0,
                        "roleplay_time_seconds": result["roleplay_time_seconds"] or 0,
                    }
                return {"practice_time_seconds": 0, "roleplay_time_seconds": 0}
                
        except Exception as e:
            logger.error(f"Failed to get daily usage: {e}")
            return {"practice_time_seconds": 0, "roleplay_time_seconds": 0}


class SubscriptionRepository:
    """Repository for subscription-related operations."""
    
    def __init__(self, db: DatabasePool):
        self.db = db
    
    async def get_active_subscription(self, user_id: int) -> Optional[Subscription]:
        """
        Get active subscription for user.
        
        Args:
            user_id: User ID
            
        Returns:
            Subscription if active, None otherwise
        """
        try:
            async with self.db.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT s.*, sp.plan_type
                    FROM subscriptions s
                    JOIN subscription_plans sp ON s.plan_id = sp.id
                    WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
                    ORDER BY s.created_at DESC
                    LIMIT 1
                    """,
                    user_id
                )
                
                if row:
                    return Subscription(
                        user_id=row["user_id"],
                        plan_type=row["plan_type"],
                        status=row["status"],
                        start_date=row["start_date"],
                        end_date=row["end_date"],
                        is_free_trial=row.get("is_free_trial", False),
                        free_trial_started_at=row.get("free_trial_started_at"),
                    )
                return None
                
        except Exception as e:
            logger.error(f"Failed to get subscription: {e}")
            return None


class CourseRepository:
    """Repository for course progress operations."""
    
    def __init__(self, db: DatabasePool):
        self.db = db
    
    async def update_speaking_progress(self, user_id: int) -> bool:
        """
        Update course speaking progress for today.
        
        Marks speaking_completed = true if user has spoken >= 5 minutes today.
        
        Args:
            user_id: User ID
            
        Returns:
            True if successful, False otherwise
        """
        try:
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
                    user_id
                )
                
                if not course:
                    return False
                
                # Get today's usage
                today_date = datetime.utcnow().date()
                usage = await conn.fetchrow(
                    """
                    SELECT practice_time_seconds, roleplay_time_seconds
                    FROM daily_usage
                    WHERE user_id = $1 AND usage_date = $2
                    """,
                    user_id,
                    today_date
                )
                
                if not usage:
                    return True  # No usage yet, nothing to update
                
                practice_used = int(usage["practice_time_seconds"] or 0)
                roleplay_used = int(usage["roleplay_time_seconds"] or 0)
                total_spoken = practice_used + roleplay_used
                
                # Only update if threshold reached
                if total_spoken < SPEAKING_COMPLETION_THRESHOLD_SECONDS:
                    return True
                
                # Calculate week and day numbers
                course_start = course["course_start_date"]
                if isinstance(course_start, datetime):
                    course_start = course_start.date()
                
                days_since_start = (today_date - course_start).days
                if days_since_start < 0:
                    days_since_start = 0
                
                week_number = (days_since_start // 7) + 1
                day_number = (days_since_start % 7) + 1
                
                # Update daily progress
                await conn.execute(
                    """
                    INSERT INTO daily_progress (
                        user_id, course_id, week_number, day_number, date,
                        speaking_completed, speaking_end_time, speaking_duration_seconds
                    )
                    VALUES ($1, $2, $3, $4, $5, true, NOW(), $6)
                    ON CONFLICT (user_id, date) DO UPDATE SET
                        course_id = EXCLUDED.course_id,
                        week_number = EXCLUDED.week_number,
                        day_number = EXCLUDED.day_number,
                        speaking_completed = true,
                        speaking_end_time = NOW(),
                        speaking_duration_seconds = GREATEST(
                            daily_progress.speaking_duration_seconds,
                            EXCLUDED.speaking_duration_seconds
                        ),
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    user_id,
                    course["id"],
                    week_number,
                    day_number,
                    today_date,
                    total_spoken,
                )
                
                logger.info(
                    f"✅ Updated course progress for user {user_id}: {total_spoken}s spoken"
                )
                return True
                
        except Exception as e:
            logger.error(f"Failed to update course progress: {e}", exc_info=True)
            return False
