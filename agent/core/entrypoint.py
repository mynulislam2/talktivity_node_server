"""
Main entrypoint for the Talktivity voice assistant agent.
Orchestrates session lifecycle using modular handlers and services.
"""

import asyncio
import logging
from datetime import datetime

from livekit.agents import (
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
)
from livekit.plugins import silero

from agent import EmotiveAgent
from config import Config, load_environment
from database import DatabasePool, test_connection
from services import setup_logging, get_logger, emit_session_save_failed
from utils.timezone import get_utc_now
from .session_manager import SessionManager
from .handlers import LLMErrorHandler, TimeCheckHandler, TranscriptSaveHandler
from .first_line import generate_first_line
# Load environment variables first
load_environment()

# Initialize logging
setup_logging()
logger = get_logger(__name__)

# Global instances (initialized in prewarm)
config: Config = None
db_pool: DatabasePool = None


def prewarm(proc: JobProcess):
    """
    Prewarm function called before first session.
    Loads VAD model and initializes global resources.
    
    Args:
        proc: Job process instance
    """
    global config, db_pool
    
    # Load configuration
    config = Config.from_env()
    logger.info("Configuration loaded successfully")
    
    # Initialize database pool
    db_pool = DatabasePool(config.database)
    logger.info("Database pool initialized")
    
    # Load VAD model
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("VAD model loaded")


async def entrypoint(ctx: JobContext):
    """
    Main entrypoint for each agent session.
    Handles complete session lifecycle from connection to cleanup.
    
    Args:
        ctx: Job context containing room and participant information
    """
    global config, db_pool
    
    logger.info("Connecting to room %s", ctx.room.name)
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for a participant to join the room
    participant = await ctx.wait_for_participant()
    logger.info("Starting voice assistant for participant %s", participant.identity)

    # Initialize session manager
    session_manager = SessionManager(config, db_pool)

    # Extract and validate metadata
    user_id, custom_prompt, first_prompt, session_type, room_name = (
        await session_manager.extract_metadata(participant)
    )

    # Update room name from context if available
    if hasattr(ctx.room, "name"):
        room_name = ctx.room.name

    # Require authenticated user for all sessions
    if user_id is None:
        logger.warning("No user_id found in metadata, cannot start session")
        return

    # Enrich prompt with user profile
    custom_prompt = await session_manager.enrich_with_profile(user_id, custom_prompt)

    # Check time limits
    can_start = await session_manager.check_time_limit(user_id, session_type)
    if not can_start:
        await emit_session_save_failed(
            user_id=user_id,
            api_url=config.api.node_api_url,
            call_id=room_name,
            error_message="Time limit reached for this session type. Please upgrade your plan for more time.",
        )
        return

    # Validate Google API key
    if not config.google.api_key:
        logger.warning(
            "GOOGLE_API_KEY not set. Please add it to your .env file or set it as an environment variable."
        )

    # Create session and LLM instance
    session, llm_instance = session_manager.create_session(ctx, config.google.api_key)

    # Prepare session info for handlers
    session_start_time = get_utc_now()
    session_info = session_manager.get_session_info(
        user_id, session_type, room_name, session_start_time
    )
    
    # For call sessions, store call_start_time in memory (NO database insert)
    if session_type == "call":
        session_info["call_start_time"] = session_start_time
        logger.info(
            "Call session started for user %s at %s (stored in memory, no DB insert)",
            user_id,
            session_start_time.isoformat()
        )

    # Setup LLM error handler
    llm_error_handler = LLMErrorHandler(session, ctx, config, session_info)
    # Wrap async handler in synchronous callback using asyncio.create_task
    llm_instance.on("error", lambda err: asyncio.create_task(llm_error_handler.handle_error(err)))

    # Setup transcript save handler
    transcript_handler = TranscriptSaveHandler(
        session, ctx, db_pool, config, session_info, participant
    )
    # Register as a shutdown callback (safety net)
    ctx.add_shutdown_callback(transcript_handler.save_transcript)

    # Create the agent with custom prompts
    agent = EmotiveAgent(custom_prompt=custom_prompt, first_prompt=first_prompt)

    # Start the session
    await session.start(
        agent=agent,
        room=ctx.room,
    )

    # Say initial greeting (LLM-generated first line)
    try:
        first_line = await generate_first_line(
            api_key=config.google.api_key,
            session_type=session_type,   # "call" | "practice" | "roleplay" from metadata
            custom_prompt=custom_prompt, # enriched with profile earlier
        )
        await session.say(first_line)
    except Exception as e:
        logger.warning("Could not say initial greeting: %s", e)

    # Setup periodic time checking for authenticated users
    if user_id:
        time_check_handler = TimeCheckHandler(session, ctx, db_pool, config, session_info)
        time_check_handler.start()

        # Register participant disconnect handler
        @ctx.room.on("participant_disconnected")
        def on_participant_disconnect(participant_disconnected):
            if participant_disconnected.identity == participant.identity:
                logger.info(
                    "Participant %s disconnected, stopping time check immediately",
                    participant.identity,
                )
                session_info["session_disconnected"] = True

                # Proactively start transcript save as soon as participant leaves,
                # instead of waiting for full worker shutdown. This reduces the
                # chance of hitting 'Executor shutdown has been called' while
                # saving the conversation.
                try:
                    asyncio.create_task(transcript_handler.save_transcript())
                except Exception as e:
                    logger.error("Error scheduling transcript save on disconnect: %s", e)

        # Clean up time check task when session ends
        ctx.add_shutdown_callback(time_check_handler.stop)


if __name__ == "__main__":
    # Run the agent using the new modular implementation
    # Note: Don't call asyncio.run() here - LiveKit CLI manages its own event loop
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
