"""
Time limit checking and calculation services.
Handles daily and lifetime time limit enforcement.
"""

import logging
from datetime import datetime

from database import DatabasePool, SubscriptionRepository, UsageRepository
from config import (
    CALL_LIFETIME_LIMIT_SECONDS,
    PRACTICE_DAILY_CAP_SECONDS,
    ROLEPLAY_BASIC_CAP_SECONDS,
    ROLEPLAY_PRO_CAP_SECONDS,
    PLAN_TYPE_PRO,
    PLAN_TYPE_BASIC,
    PLAN_TYPE_FREE_TRIAL,
)
from services.shared import TimeLimitError
from utils.timezone import get_utc_now, get_utc_today

logger = logging.getLogger(__name__)


class TimeLimitService:
    """Service for checking and calculating time limits."""
    
    def __init__(self, db: DatabasePool):
        self.db = db
        self.subscription_repo = SubscriptionRepository(db)
        self.usage_repo = UsageRepository(db)
    
    async def check_can_start_session(self, user_id: int, session_type: str) -> bool:
        """
        Check if user can start a new session based on time limits.
        
        Args:
            user_id: User ID
            session_type: Type of session ("call", "practice", "roleplay")
            
        Returns:
            True if user can start, False otherwise
            
        Raises:
            TimeLimitError: If time limit is exceeded
        """
        session_type = session_type.lower()
        
        # Call sessions check lifetime limit
        if session_type == "call":
            lifetime_used = await self.usage_repo.get_lifetime_call_usage(user_id)
            remaining = CALL_LIFETIME_LIMIT_SECONDS - lifetime_used
            
            if remaining <= 0:
                logger.warning(f"User {user_id} exceeded call lifetime limit")
                return False
            
            logger.info(f"User {user_id} can start call ({remaining}s remaining)")
            return True
        
        # Practice/roleplay require active subscription
        subscription = await self.subscription_repo.get_active_subscription(user_id)
        if not subscription:
            logger.warning(f"User {user_id} has no active subscription for {session_type}")
            return False
        
        # Get time caps based on plan
        practice_cap = PRACTICE_DAILY_CAP_SECONDS
        
        if subscription.plan_type == PLAN_TYPE_PRO:
            roleplay_cap = ROLEPLAY_PRO_CAP_SECONDS
        else:  # Basic or FreeTrial
            roleplay_cap = ROLEPLAY_BASIC_CAP_SECONDS
        
        # Get today's usage from daily_progress (not daily_usage)
        async with self.db.acquire() as conn:
            usage_row = await conn.fetchrow(
                """
                SELECT speaking_duration_seconds AS practice_time_seconds,
                       roleplay_duration_seconds AS roleplay_time_seconds
                FROM daily_progress
                WHERE user_id = $1 AND progress_date = $2
                """,
                user_id,
                get_utc_today(),
            )

        practice_used = int(usage_row["practice_time_seconds"] or 0) if usage_row else 0
        roleplay_used = int(usage_row["roleplay_time_seconds"] or 0) if usage_row else 0

        if session_type == "practice":
            used = practice_used
            remaining = practice_cap - used
        elif session_type == "roleplay":
            used = roleplay_used
            remaining = roleplay_cap - used
        else:
            logger.warning(f"Unknown session type: {session_type}")
            return False
        
        if remaining <= 0:
            logger.warning(
                f"User {user_id} exceeded {session_type} daily limit "
                f"(used={used}s, cap={practice_cap if session_type == 'practice' else roleplay_cap}s)"
            )
            return False
        
        logger.info(
            f"User {user_id} can start {session_type} ({remaining}s remaining)"
        )
        return True
    
    async def get_remaining_time_during_session(
        self,
        user_id: int,
        session_type: str,
        current_duration: int
    ) -> int:
        """
        Get remaining time during an active session.
        
        Args:
            user_id: User ID
            session_type: Type of session
            current_duration: Current session duration in seconds
            
        Returns:
            Remaining seconds (0 if exceeded)
        """
        session_type = session_type.lower()
        
        # Call lifetime limit
        if session_type == "call":
            lifetime_used = await self.usage_repo.get_lifetime_call_usage(user_id)
            total_would_be = lifetime_used + current_duration
            remaining = CALL_LIFETIME_LIMIT_SECONDS - total_would_be
            return max(0, remaining)
        
        # Practice/roleplay require subscription
        subscription = await self.subscription_repo.get_active_subscription(user_id)
        if not subscription:
            return 0
        
        # Get caps
        practice_cap = PRACTICE_DAILY_CAP_SECONDS
        roleplay_cap = (
            ROLEPLAY_PRO_CAP_SECONDS
            if subscription.plan_type == PLAN_TYPE_PRO
            else ROLEPLAY_BASIC_CAP_SECONDS
        )
        
        # Get today's usage from daily_progress
        async with self.db.acquire() as conn:
            usage_row = await conn.fetchrow(
                """
                SELECT speaking_duration_seconds AS practice_time_seconds,
                       roleplay_duration_seconds AS roleplay_time_seconds
                FROM daily_progress
                WHERE user_id = $1 AND progress_date = $2
                """,
                user_id,
                get_utc_today(),
            )

        practice_used = int(usage_row["practice_time_seconds"] or 0) if usage_row else 0
        roleplay_used = int(usage_row["roleplay_time_seconds"] or 0) if usage_row else 0

        if session_type == "practice":
            used = practice_used
            remaining = practice_cap - (used + current_duration)
        elif session_type == "roleplay":
            used = roleplay_used
            remaining = roleplay_cap - (used + current_duration)
        else:
            return 0
        
        return max(0, remaining)
    
    async def get_remaining_lifetime_time(
        self,
        user_id: int,
        current_elapsed_seconds: int
    ) -> int:
        """
        Get remaining lifetime call time during an active call session.
        Tracks elapsed time in memory and checks against existing completed sessions only.
        
        Args:
            user_id: User ID
            current_elapsed_seconds: Elapsed time in current session (from memory)
            
        Returns:
            Remaining seconds (0 if exceeded)
        """
        try:
            # Get total from completed sessions only (not current session)
            lifetime_used = await self.usage_repo.get_lifetime_call_usage(user_id)
            total_with_current = lifetime_used + current_elapsed_seconds
            remaining = CALL_LIFETIME_LIMIT_SECONDS - total_with_current
            return max(0, remaining)
        except Exception as e:
            logger.error(f"Failed to get remaining lifetime time: {e}")
            return 0