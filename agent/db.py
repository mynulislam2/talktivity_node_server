import json
from datetime import datetime, timedelta

import asyncpg

from config import PG_DATABASE, PG_HOST, PG_PASSWORD, PG_PORT, PG_USER, logger
from utils.timezone import get_utc_now, get_utc_today


async def test_postgres_connection():
    """Simple connectivity check to PostgreSQL."""
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
            ssl=True,  # use this if you're using Neon/Supabase/managed DBs
        )
        logger.info("✅ PostgreSQL connection successful!")
        await conn.close()
    except Exception:
        logger.exception("❌ Failed to connect to PostgreSQL")


CALL_LIFETIME_LIMIT_SECONDS = 5 * 60
PRACTICE_CAP_SECONDS = 5 * 60
ROLEPLAY_CAP_PRO_SECONDS = 55 * 60
ROLEPLAY_CAP_BASIC_SECONDS = 5 * 60


async def check_daily_time_limit(user_id: int, session_type: str) -> bool:
    """
    Check if user has remaining time for the requested session type.
    Session types: call | practice | roleplay.
    """
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
            ssl=True,
        )

        session_type = (session_type or "call").lower()

        # Call sessions use lifetime 5m cap for all users
        if session_type == "call":
            lifetime_query = """
                SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds 
                FROM lifetime_call_usage 
                WHERE user_id = $1
            """
            lifetime_result = await conn.fetchrow(lifetime_query, user_id)
            lifetime_used = lifetime_result["total_seconds"] if lifetime_result else 0
            remaining = CALL_LIFETIME_LIMIT_SECONDS - lifetime_used
            await conn.close()
            return remaining > 0

        # practice / roleplay require active subscription
        subscription_query = """
            SELECT s.*, sp.plan_type, sp.features
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > (NOW() AT TIME ZONE 'UTC')
            ORDER BY s.created_at DESC
            LIMIT 1
        """
        subscription_result = await conn.fetchrow(subscription_query, user_id)

        if not subscription_result:
            await conn.close()
            return False

        subscription = subscription_result
        is_free_trial = (
            subscription["is_free_trial"]
            and subscription["free_trial_started_at"]
            and get_utc_now()
            < subscription["free_trial_started_at"] + timedelta(days=7)
        )

        plan_type = subscription["plan_type"]
        practice_cap = PRACTICE_CAP_SECONDS
        roleplay_cap = (
            ROLEPLAY_CAP_BASIC_SECONDS
            if plan_type in ("FreeTrial", "Basic") or is_free_trial
            else ROLEPLAY_CAP_PRO_SECONDS
        )

        today = get_utc_today()
        usage_query = """
            SELECT practice_time_seconds, roleplay_time_seconds
            FROM daily_usage 
            WHERE user_id = $1 AND usage_date = $2
        """
        usage_result = await conn.fetchrow(usage_query, user_id, today)
        practice_used = usage_result["practice_time_seconds"] if usage_result else 0
        roleplay_used = usage_result["roleplay_time_seconds"] if usage_result else 0

        if session_type == "practice":
            remaining = practice_cap - practice_used
        elif session_type == "roleplay":
            remaining = roleplay_cap - roleplay_used
        else:
            remaining = 0

        await conn.close()
        return remaining > 0

    except Exception as e:
        logger.error("Error checking daily time limit for user %s: %s", user_id, e)
        return False


async def get_remaining_time_during_call(
    user_id: int, session_type: str, current_session_duration_seconds: int
) -> int:
    """
    Get remaining time during an active session, accounting for current session duration.
    Returns remaining seconds (never negative).
    """
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
            ssl=True,
        )

        session_type = (session_type or "call").lower()

        # Call lifetime limit
        if session_type == "call":
            lifetime_usage_query = """
                SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds 
                FROM lifetime_call_usage 
                WHERE user_id = $1
            """
            lifetime_result = await conn.fetchrow(lifetime_usage_query, user_id)
            lifetime_used = lifetime_result["total_seconds"] if lifetime_result else 0
            total_would_be = lifetime_used + current_session_duration_seconds
            remaining = CALL_LIFETIME_LIMIT_SECONDS - total_would_be
            await conn.close()
            return max(0, remaining)

        # For practice/roleplay, require active subscription
        subscription_query = """
            SELECT s.*, sp.plan_type, sp.features
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > (NOW() AT TIME ZONE 'UTC')
            ORDER BY s.created_at DESC
            LIMIT 1
        """
        subscription_result = await conn.fetchrow(subscription_query, user_id)

        if not subscription_result:
            await conn.close()
            return 0

        subscription = subscription_result

        plan_type = subscription["plan_type"]
        is_free_trial = (
            subscription["is_free_trial"]
            and subscription["free_trial_started_at"]
            and datetime.now()
            < subscription["free_trial_started_at"] + timedelta(days=7)
        )

        # Caps per type
        practice_cap = PRACTICE_CAP_SECONDS
        if plan_type == "Pro":
            roleplay_cap = ROLEPLAY_CAP_PRO_SECONDS
        elif plan_type in ("FreeTrial", "Basic") or is_free_trial:
            roleplay_cap = ROLEPLAY_CAP_BASIC_SECONDS
        else:
            roleplay_cap = 0

        # Get TODAY's usage from daily_progress (per-type, not pooled)
        today = get_utc_today()
        usage_query = """
            SELECT speaking_duration_seconds AS practice_time_seconds,
                   roleplay_duration_seconds AS roleplay_time_seconds
            FROM daily_progress 
            WHERE user_id = $1 AND progress_date = $2
        """
        usage_result = await conn.fetchrow(usage_query, user_id, today)

        practice_used = int(usage_result["practice_time_seconds"] or 0) if usage_result else 0
        roleplay_used = int(usage_result["roleplay_time_seconds"] or 0) if usage_result else 0

        if session_type == "practice":
            remaining_time_seconds = practice_cap - (practice_used + current_session_duration_seconds)
        else:
            remaining_time_seconds = roleplay_cap - (roleplay_used + current_session_duration_seconds)

        await conn.close()
        return max(0, remaining_time_seconds)

    except Exception as e:
        logger.error(
            "Error getting remaining time for user %s: %s", user_id, e
        )
        return 0


async def record_session_usage(user_id: int, session_type: str, duration_seconds: int) -> bool:
    """
    Persist usage after a session ends.
    - call: insert into lifetime_call_usage (no daily_usage impact)
    - practice/roleplay: daily totals now come from daily_progress (no daily_usage writes)
    """
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
            ssl=True,
        )

        session_type = (session_type or "call").lower()

        if session_type == "call":
            await conn.execute(
                """
                INSERT INTO lifetime_call_usage (user_id, duration_seconds)
                VALUES ($1, $2)
                """,
                user_id,
                duration_seconds,
            )
            await conn.close()
            return True

        if session_type not in {"practice", "roleplay"}:
            await conn.close()
            return False

        # Practice/roleplay usage is now accumulated via daily_progress updates in the agent.
        # We no longer write to the deprecated daily_usage table here.
        await conn.close()
        return True

    except Exception as e:
        logger.error("Failed to record session usage for user %s: %s", user_id, e)
        return False


async def update_course_speaking_progress(user_id: int) -> bool:
    """
    Update course speaking completion for today based on DB totals.

    This replaces the old Node `/api/courses/speaking/start` and `/api/courses/speaking/end` flow.

    Rule: If today's total speaking time >= 5 minutes, mark
    daily_progress.speaking_completed = true and store speaking_duration_seconds.

    Source of truth for time: daily_progress.speaking_duration_seconds + daily_progress.roleplay_duration_seconds.
    """
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
            ssl=True,
        )

        # Active course required for daily_progress updates
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
            await conn.close()
            return False

        today_date = get_utc_today()
        course_start = course["course_start_date"]
        # course_start may be date or datetime
        if isinstance(course_start, datetime):
            course_start = course_start.date()

        days_since_start = (today_date - course_start).days
        if days_since_start < 0:
            days_since_start = 0
        week_number = (days_since_start // 7) + 1
        day_number = (days_since_start % 7) + 1

        usage = await conn.fetchrow(
            """
            SELECT speaking_duration_seconds AS practice_time_seconds,
                   roleplay_duration_seconds AS roleplay_time_seconds
            FROM daily_progress
            WHERE user_id = $1 AND progress_date = $2
            """,
            user_id,
            today_date,
        )

        practice_used = int(usage["practice_time_seconds"] or 0) if usage else 0
        roleplay_used = int(usage["roleplay_time_seconds"] or 0) if usage else 0
        total_spoken = practice_used + roleplay_used

        # Only mark completed when threshold reached
        if total_spoken < 5 * 60:
            await conn.close()
            return True

        await conn.execute(
            """
            INSERT INTO daily_progress (
                user_id,
                course_id,
                week_number,
                day_number,
                progress_date,
                speaking_completed,
                speaking_ended_at,
                speaking_duration_seconds
            )
            VALUES ($1, $2, $3, $4, $5, true, (NOW() AT TIME ZONE 'UTC'), $6)
            ON CONFLICT (user_id, progress_date) DO UPDATE SET
                course_id = EXCLUDED.course_id,
                week_number = EXCLUDED.week_number,
                day_number = EXCLUDED.day_number,
                speaking_completed = true,
                speaking_ended_at = (NOW() AT TIME ZONE 'UTC'),
                speaking_duration_seconds = GREATEST(daily_progress.speaking_duration_seconds, EXCLUDED.speaking_duration_seconds),
                updated_at = (NOW() AT TIME ZONE 'UTC')
            """,
            user_id,
            course["id"],
            week_number,
            day_number,
            today_date,
            total_spoken,
        )

        await conn.close()
        return True

    except Exception as e:
        logger.error("Failed to update course speaking progress for user %s: %s", user_id, e)
        return False


async def fetch_user_onboarding_data(user_id: int) -> dict:
    """
    Fetch all onboarding data for a user from the database.
    Returns dictionary with all user's profile information for building custom prompts.
    """
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
            ssl=True,
        )
        
        query = """
            SELECT * FROM onboarding_data WHERE user_id = $1
        """
        result = await conn.fetchrow(query, user_id)
        await conn.close()
        
        if result:
            # Convert Record to dictionary with all fields
            return dict(result)
        return {}
    except Exception:
        return {}


async def ensure_test_call_usage_table(conn):
    await conn.execute(
        """
    CREATE TABLE IF NOT EXISTS test_call_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        started_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
        duration_seconds INTEGER NOT NULL
    )
    """
    )


async def save_test_call_usage(user_id: int, duration_seconds: int):
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
            ssl=True,
        )
        await ensure_test_call_usage_table(conn)
        await conn.execute(
            """
            INSERT INTO test_call_usage (user_id, duration_seconds)
            VALUES ($1, $2)
        """,
            user_id,
            duration_seconds,
        )
        await conn.close()
    except Exception as e:
        logger.error("Failed to save test call usage for user %s: %s", user_id, e)


async def create_conversations_table(conn):
    """Create necessary conversations table in PostgreSQL if it doesn't exist."""
    await conn.execute(
        """
    CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        room_name VARCHAR(255) NOT NULL,
        user_id INTEGER NOT NULL,
        session_type VARCHAR(50) DEFAULT 'call',
        timestamp TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC'),
        transcript JSONB NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """
    )
    
    # Add session_type column if it doesn't exist (migration)
    try:
        await conn.execute(
            """
        ALTER TABLE conversations 
        ADD COLUMN IF NOT EXISTS session_type VARCHAR(50) DEFAULT 'call'
        """
        )
    except Exception:
        pass

    # Create indexes separately
    await conn.execute(
        """
    CREATE INDEX IF NOT EXISTS idx_conversations_room ON conversations(room_name)
    """
    )

    await conn.execute(
        """
    CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp)
    """
    )

    await conn.execute(
        """
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)
    """
    )


async def save_transcript_to_postgres(room_name, participant_identity, transcript_data, session_type="call"):
    """Save transcript to PostgreSQL database for authenticated users."""
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
        )

        # Ensure our table exists
        await create_conversations_table(conn)

        # Extract user ID from participant identity (now just a numeric string)
        try:
            user_id = int(participant_identity)
        except ValueError:
            await conn.close()
            return False

        # Insert the transcript data with session_type
        await conn.execute(
            """
        INSERT INTO conversations (room_name, user_id, session_type, timestamp, transcript)
        VALUES ($1, $2, $3, $4, $5)
        """,
            room_name,
            user_id,
            session_type,
            get_utc_now(),
            json.dumps(transcript_data),
        )

        await conn.close()
        return True
    except Exception as e:
        await conn.close()
        return False


