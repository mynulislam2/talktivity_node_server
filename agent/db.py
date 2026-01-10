import json
from datetime import datetime, timedelta

import asyncpg

from config import PG_DATABASE, PG_HOST, PG_PASSWORD, PG_PORT, PG_USER, logger


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


async def check_daily_time_limit(user_id: int) -> bool:
    """Check if user has remaining daily time for calls/practice/roleplay."""
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
            ssl=True,
        )

        # Get user's active subscription
        subscription_query = """
            SELECT s.*, sp.plan_type, sp.features
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
            ORDER BY s.created_at DESC
            LIMIT 1
        """
        subscription_result = await conn.fetchrow(subscription_query, user_id)

        if not subscription_result:
            # Check if user can use onboarding test call
            user_query = """
                SELECT onboarding_test_call_used FROM users 
                WHERE id = $1
            """
            user_result = await conn.fetchrow(user_query, user_id)

            if not user_result:
                logger.warning("User %s not found", user_id)
                await conn.close()
                return False

            has_used_onboarding_call = user_result["onboarding_test_call_used"] or False

            if has_used_onboarding_call:
                logger.warning(
                    "Onboarding test call already used for user %s", user_id
                )
                await conn.close()
                return False

            # Allow onboarding call - check if user has used their 5-minute lifetime limit
            lifetime_usage_query = """
                SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds 
                FROM device_speaking_sessions 
                WHERE user_id = $1
            """
            lifetime_result = await conn.fetchrow(lifetime_usage_query, user_id)
            lifetime_seconds = lifetime_result["total_seconds"] if lifetime_result else 0

            if lifetime_seconds >= 5 * 60:  # 5 minutes total lifetime limit
                logger.warning(
                    "Onboarding test call time limit exceeded for user %s", user_id
                )
                await conn.close()
                return False

            logger.info(
                "Onboarding test call allowed for user %s, used: %ss",
                user_id,
                lifetime_seconds,
            )
            await conn.close()
            return True

        subscription = subscription_result

        # Check if it's a free trial
        _ = (
            subscription["is_free_trial"]
            and subscription["free_trial_started_at"]
            and datetime.now()
            < subscription["free_trial_started_at"] + timedelta(days=7)
        )

        # Calculate daily limits based on plan
        if subscription["plan_type"] == "Pro":
            daily_limit_seconds = 60 * 60  # 1 hour
        else:
            # Default and Basic and FreeTrial capped at 5 minutes
            daily_limit_seconds = 5 * 60

        # Get today's usage as a proper date object (asyncpg expects date, not string)
        today = datetime.now().date()
        usage_query = """
            SELECT call_time_seconds, practice_time_seconds, roleplay_time_seconds
            FROM daily_usage 
            WHERE user_id = $1 AND usage_date = $2
        """
        usage_result = await conn.fetchrow(usage_query, user_id, today)

        # Calculate used time (do NOT count onboarding test call towards daily usage)
        used_time_seconds = 0
        if usage_result:
            used_time_seconds = (
                (usage_result["call_time_seconds"] or 0)
                + (usage_result["practice_time_seconds"] or 0)
                + (usage_result["roleplay_time_seconds"] or 0)
            )

        remaining_time_seconds = max(0, daily_limit_seconds - used_time_seconds)

        logger.info(
            "User %s - Plan: %s, Used: %ss, Remaining: %ss",
            user_id,
            subscription["plan_type"],
            used_time_seconds,
            remaining_time_seconds,
        )

        await conn.close()
        return remaining_time_seconds > 0

    except Exception as e:
        logger.error("Error checking daily time limit for user %s: %s", user_id, e)
        return False


async def get_remaining_time_during_call(
    user_id: int, session_type: str, current_session_duration_seconds: int
) -> int:
    """
    Get remaining time during an active call, accounting for current session duration.
    Returns remaining seconds (can be negative if over limit).
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

        # For test calls, check lifetime limit
        if session_type == "test":
            lifetime_usage_query = """
                SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds 
                FROM device_speaking_sessions 
                WHERE user_id = $1
            """
            lifetime_result = await conn.fetchrow(lifetime_usage_query, user_id)
            lifetime_used = lifetime_result["total_seconds"] if lifetime_result else 0
            
            # Total would be: lifetime_used + current_session_duration
            total_would_be = lifetime_used + current_session_duration_seconds
            lifetime_limit = 5 * 60  # 5 minutes
            
            remaining = lifetime_limit - total_would_be
            await conn.close()
            return max(0, remaining)

        # For practice/roleplay, check daily limit
        subscription_query = """
            SELECT s.*, sp.plan_type, sp.features
            FROM subscriptions s
            JOIN subscription_plans sp ON s.plan_id = sp.id
            WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
            ORDER BY s.created_at DESC
            LIMIT 1
        """
        subscription_result = await conn.fetchrow(subscription_query, user_id)

        if not subscription_result:
            # No subscription - check onboarding
            user_query = """
                SELECT onboarding_test_call_used FROM users 
                WHERE id = $1
            """
            user_result = await conn.fetchrow(user_query, user_id)
            if not user_result:
                await conn.close()
                return 0

            has_used_onboarding_call = user_result["onboarding_test_call_used"] or False
            if has_used_onboarding_call:
                await conn.close()
                return 0

            # Onboarding: 5 minute lifetime limit
            lifetime_usage_query = """
                SELECT COALESCE(SUM(duration_seconds), 0) as total_seconds 
                FROM device_speaking_sessions 
                WHERE user_id = $1
            """
            lifetime_result = await conn.fetchrow(lifetime_usage_query, user_id)
            lifetime_used = lifetime_result["total_seconds"] if lifetime_result else 0
            total_would_be = lifetime_used + current_session_duration_seconds
            remaining = (5 * 60) - total_would_be
            await conn.close()
            return max(0, remaining)

        subscription = subscription_result

        # Calculate DAILY limits based on plan (resets each day)
        if subscription["plan_type"] == "Pro":
            daily_limit_seconds = 60 * 60  # 1 hour per day
        else:
            daily_limit_seconds = 5 * 60  # 5 minutes per day

        # Get TODAY's usage only (only practice + roleplay, not test calls)
        # This is a daily limit that resets at midnight
        today = datetime.now().date()
        usage_query = """
            SELECT practice_time_seconds, roleplay_time_seconds
            FROM daily_usage 
            WHERE user_id = $1 AND usage_date = $2
        """
        usage_result = await conn.fetchrow(usage_query, user_id, today)

        # Calculate used time for TODAY (practice + roleplay combined)
        # Basic: 5 minutes total per day for both
        # Pro: 60 minutes total per day for both
        used_time_seconds = 0
        if usage_result:
            used_time_seconds = (
                (usage_result["practice_time_seconds"] or 0)
                + (usage_result["roleplay_time_seconds"] or 0)
            )

        # Remaining = daily_limit - (today's_used + current_session)
        # For practice/roleplay: Basic=5min/day total, Pro=60min/day total
        remaining_time_seconds = daily_limit_seconds - (used_time_seconds + current_session_duration_seconds)

        await conn.close()
        return max(0, remaining_time_seconds)

    except Exception as e:
        logger.error(
            "Error getting remaining time for user %s: %s", user_id, e
        )
        return 0


async def create_device_conversations_table(conn):
    """Create device-based conversation table if it doesn't exist."""
    await conn.execute(
        """
    CREATE TABLE IF NOT EXISTS device_conversations (
        id SERIAL PRIMARY KEY,
        room_name VARCHAR(255) NOT NULL,
        device_id VARCHAR(64) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        transcript JSONB NOT NULL
    )
    """
    )

    await conn.execute(
        """
    CREATE INDEX IF NOT EXISTS idx_device_conversations_room ON device_conversations(room_name)
    """
    )

    await conn.execute(
        """
    CREATE INDEX IF NOT EXISTS idx_device_conversations_timestamp ON device_conversations(timestamp)
    """
    )

    await conn.execute(
        """
    CREATE INDEX IF NOT EXISTS idx_device_conversations_device_id ON device_conversations(device_id)
    """
    )


async def save_transcript_by_device_id(room_name, device_id, transcript_data):
    """Save transcript to PostgreSQL using device_id."""
    try:
        conn = await asyncpg.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database=PG_DATABASE,
        )

        # Ensure the device-based table exists
        await create_device_conversations_table(conn)

        # Insert the transcript
        await conn.execute(
            """
        INSERT INTO device_conversations (room_name, device_id, timestamp, transcript)
        VALUES ($1, $2, $3, $4)
        """,
            room_name,
            device_id,
            datetime.now(),
            json.dumps(transcript_data),
        )

        logger.info(
            "Transcript for room %s and device %s saved to PostgreSQL",
            room_name,
            device_id,
        )
        await conn.close()
        return True
    except Exception as e:
        logger.error("Error saving device transcript to PostgreSQL: %s", e)
        return False


async def ensure_test_call_usage_table(conn):
    await conn.execute(
        """
    CREATE TABLE IF NOT EXISTS test_call_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        transcript JSONB NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """
    )

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


async def save_transcript_to_postgres(room_name, participant_identity, transcript_data):
    """Save transcript to PostgreSQL database for user_X format identities."""
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

        # Extract user ID from participant identity (e.g., 'user_1' -> 1)
        if participant_identity.startswith("user_"):
            user_id = int(participant_identity.replace("user_", ""))
        else:
            # If it's a pure number string, use it directly
            try:
                user_id = int(participant_identity)
            except ValueError:
                # If it's not a valid integer, log error and return False
                logger.error(
                    "Cannot convert participant_identity '%s' to user_id for conversations table",
                    participant_identity,
                )
                await conn.close()
                return False

        # Insert the transcript data
        await conn.execute(
            """
        INSERT INTO conversations (room_name, user_id, timestamp, transcript)
        VALUES ($1, $2, $3, $4)
        """,
            room_name,
            user_id,
            datetime.now(),
            json.dumps(transcript_data),
        )

        logger.info(
            "Transcript for room %s and user_id %s saved to PostgreSQL",
            room_name,
            user_id,
        )
        await conn.close()
        return True
    except Exception as e:
        logger.error("Error saving transcript to PostgreSQL: %s", e)
        await conn.close()
        return False


