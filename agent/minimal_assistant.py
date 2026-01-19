import asyncio
from datetime import datetime

from livekit.agents import (
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    room_io,
)
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.turn_detector.english import EnglishModel
from livekit.plugins import google, groq
import json

from agent import EmotiveAgent
from config import API_URL, GOOGLE_API_KEY, logger
from db import check_daily_time_limit, get_remaining_time_during_call, test_postgres_connection
from services.transcript_service import save_session_transcript
from services.socket_service import (
    emit_saving_conversation,
    emit_session_saved,
    emit_session_save_failed,
)
import httpx


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    logger.info("connecting to room %s", ctx)
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # wait for a participant to join the room
    participant = await ctx.wait_for_participant()
    logger.info("starting voice assistant for participant %s", participant.identity)

    # Extract metadata from participant
    metadata = {}
    custom_prompt = ""
    first_prompt = ""
    session_type = "call"

    try:
        if participant.metadata and hasattr(participant.metadata, "__str__"):
            # Check if metadata is a string that can be parsed
            metadata_str = str(participant.metadata)
            if metadata_str and metadata_str != "MagicMock":
                import json

                metadata = json.loads(metadata_str)
                custom_prompt = metadata.get("prompt", "")
                first_prompt = metadata.get("firstPrompt", "")
                session_type = metadata.get("sessionType", "call")
                logger.info("Loaded metadata: %s", metadata)
            else:
                logger.info("Using default metadata (console mode)")
        else:
            logger.info("Using default metadata (console mode)")
    except (ValueError, TypeError) as e:
        logger.warning("Could not parse participant metadata: %s", e)
        # Use default values if metadata parsing fails

    # Normalize session type to supported values
    if session_type not in {"call", "practice", "roleplay"}:
        session_type = "call"

    # Enforce limits in Python (call/practice/roleplay)
    if participant.identity.startswith("user_"):
        user_id = int(participant.identity.replace("user_", ""))
        if not await check_daily_time_limit(user_id, session_type):
            logger.warning("Time limit exceeded for user %s (%s)", user_id, session_type)
            # Emit session save failed with time limit message
            await emit_session_save_failed(
                user_id=user_id,
                call_id=getattr(ctx.room, "name", None),
                error_message="Time limit reached for this session type. Please upgrade your plan for more time.",
            )
            return

    # Create LLM using Google API Key (from Google AI Studio)
    # Uses GOOGLE_API_KEY environment variable set in config.py
    # Get your API key from: https://aistudio.google.com/apikey
    # Set GOOGLE_API_KEY in your .env file or environment
    if not GOOGLE_API_KEY:
        logger.warning("GOOGLE_API_KEY not set. Please add it to your .env file or set it as an environment variable.")
    
    llm_instance = google.LLM(
        model="gemini-2.0-flash-exp",
        temperature=1,
        vertexai=False,  # Use Google AI Studio API with API key
        api_key=GOOGLE_API_KEY if GOOGLE_API_KEY else None,  # Pass API key directly
    )
    
    # Track quota exhaustion to prevent infinite retries
    quota_exhausted = False
    
    def handle_llm_error(error):
        """Handle LLM errors, especially quota exhaustion (429 errors)."""
        nonlocal quota_exhausted
        error_str = str(error)
        
        # Check if it's a 429 quota exhaustion error
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "Too Many Requests" in error_str:
            if not quota_exhausted:
                quota_exhausted = True
                logger.error(
                    "Google API quota exhausted (429). The agent will disconnect. "
                    "Please check your Google Cloud API quotas or service account limits."
                )
                
                # Disconnect gracefully with a message
                async def disconnect_on_quota():
                    try:
                        # Emit session save failed for quota exhaustion
                        if participant.identity.startswith("user_"):
                            user_id = int(participant.identity.replace("user_", ""))
                            await emit_session_save_failed(
                                user_id=user_id,
                                call_id=getattr(ctx.room, "name", None),
                                error_message="Service temporarily unavailable. Please try again later.",
                            )
                        
                        # Close the session
                        await session.aclose()
                    except Exception as e:
                        logger.warning("Error disconnecting on quota exhaustion: %s", e)
                
                # Schedule the disconnect
                asyncio.create_task(disconnect_on_quota())
        else:
            logger.warning("LLM error (non-quota): %s", error)
    
    # Register error handler for LLM
    llm_instance.on("error", handle_llm_error)
    
    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        # Use Google STT by default (Groq alternative kept as comment)
        stt=google.STT(model="latest_long"),
        # stt=groq.STT(model="whisper-large-v3-turbo"),
        # Use Google LLM with service account credentials directly
        # Uses GOOGLE_APPLICATION_CREDENTIALS environment variable (set in config.py)
        # Credentials file: ./credentials/google-tts-key.json
        llm=llm_instance,
        # Use Google TTS
        tts=google.TTS(
            voice_name="en-US-Chirp3-HD-Kore",
            language="en-US",
            sample_rate=24000,
        ),
    
        # Use English turn detector for better real-time detection
        turn_detection=EnglishModel(),
        # Enable interruptions for more natural conversation
        allow_interruptions=True,
        # Configure end of turn detection
        min_endpointing_delay=0.1,
        max_endpointing_delay=0.3,
    )

    # Function to save the transcript when the session ends
    session_start_time = datetime.utcnow()
    
    # Get user_id if available (for storing transcript in memory)
    user_id = None
    if participant.identity.startswith("user_"):
        try:
            user_id = int(participant.identity.replace("user_", ""))
        except ValueError:
            pass
            
    saving_emitted = False
    session_save_handled = False
    
    async def write_transcript():
        """
        Save the transcript when the session ends.
        Emits SESSION_STATE events to frontend:
        1. SAVING_CONVERSATION - before saving
        2. SESSION_SAVED or SESSION_SAVE_FAILED - after save attempt
        """
        nonlocal session_save_handled
        
        # Prevent duplicate saves
        if session_save_handled:
            logger.info("Session save already handled, skipping duplicate")
            return
        session_save_handled = True
        
        room_name = getattr(ctx.room, "name", f"call_{user_id}") if hasattr(ctx, "room") else f"call_{user_id}"
        
        # Step 1: Emit SAVING_CONVERSATION state to frontend
        nonlocal saving_emitted
        if user_id and not saving_emitted:
            logger.info("📤 Emitting SAVING_CONVERSATION for user %s", user_id)
            await emit_saving_conversation(user_id=user_id, call_id=room_name)
            saving_emitted = True
        
        # Get transcript from session
        try:
            transcript_data = session.history.to_dict()
        except Exception as e:
            logger.error("Error getting transcript data: %s", e)
            if user_id:
                await emit_session_save_failed(
                    user_id=user_id,
                    call_id=room_name,
                    error_message="Failed to retrieve conversation data.",
                )
            return
        
        # Save transcript to database
        save_success = await save_session_transcript(
            session=session,
            ctx=ctx,
            participant=participant,
            session_type=session_type,
            session_start_time=session_start_time,
        )
        
        # Step 3: Emit SESSION_SAVED or SESSION_SAVE_FAILED based on result
        if user_id:
            if save_success:
                logger.info("📤 Emitting SESSION_SAVED for user %s", user_id)
                await emit_session_saved(user_id=user_id, call_id=room_name)
            else:
                logger.error("📤 Emitting SESSION_SAVE_FAILED for user %s", user_id)
                await emit_session_save_failed(
                    user_id=user_id,
                    call_id=room_name,
                    error_message="Failed to save conversation to database. Please try again.",
                )

    # Add the transcript saving function as a shutdown callback
    ctx.add_shutdown_callback(write_transcript)

    # Create the agent with custom prompts from metadata
    agent = EmotiveAgent(custom_prompt=custom_prompt, first_prompt=first_prompt)

    await session.start(
        agent=agent,
        room=ctx.room,
        # Use RoomOptions instead of deprecated RoomInputOptions/RoomOutputOptions
        # text_output=True enables transcription output
        room_options=room_io.RoomOptions(
            text_output=True,  # Enables transcription output
            # Note: noise_cancellation.BVC() requires LiveKit Cloud
            # For local servers, omit noise cancellation
            # audio_input=room_io.AudioInputOptions(
            #     noise_cancellation=noise_cancellation.BVC()
            # ),
        ),
    )
    
    try:
        await session.say("Hi! how are you doing!")
    except Exception as e:  # pragma: no cover - non-critical greeting
        logger.warning("Could not say initial greeting: %s", e)

    # Periodic time checking for authenticated users
    if participant.identity.startswith("user_"):
        user_id = int(participant.identity.replace("user_", ""))
        time_check_task = None
        session_disconnected = False

        async def check_time_periodically():
            """Check remaining time every 10 seconds and disconnect if time runs out."""
            nonlocal session_disconnected
            check_interval = 10  # Check every 10 seconds

            while not session_disconnected:
                try:
                    await asyncio.sleep(check_interval)
                    
                    # Double-check if session is still active before doing time check
                    if session_disconnected:
                        logger.info("Session already disconnected, stopping time check")
                        break
                    
                    # Calculate current session duration
                    current_duration = int(
                        (datetime.now() - session_start_time).total_seconds()
                    )
                    
                    # Get remaining time accounting for current session
                    remaining = await get_remaining_time_during_call(
                        user_id, session_type, current_duration
                    )
                    
                    logger.info(
                        "Time check - User %s, Session: %s, Duration: %ss, Remaining: %ss",
                        user_id,
                        session_type,
                        current_duration,
                        remaining,
                    )
                    
                    # If time runs out, disconnect gracefully
                    if remaining <= 0:
                        logger.warning(
                            "Time limit reached for user %s. Disconnecting call.",
                            user_id,
                        )
                        
                        # Mark session as disconnected to trigger save flow
                        session_disconnected = True
                        
                        # Signal to frontend specifically that time is up
                        if user_id:
                            from services.socket_service import emit_session_state, SESSION_STATE_SAVING
                            nonlocal saving_emitted
                            await emit_session_state(
                                user_id=user_id,
                                state=SESSION_STATE_SAVING,
                                call_id=getattr(ctx.room, "name", f"call_{user_id}"),
                                message="Daily time limit reached for this session type. Saving your conversation…",
                            )
                            saving_emitted = True

                        # Close the session - this will trigger the shutdown callback (write_transcript)
                        # which handles the actual saving logic
                        try:
                            await session.aclose()
                        except Exception as e:
                            logger.warning("Error closing session: %s", e)
                        
                        # Disconnect from room
                        try:
                            await ctx.room.disconnect()
                        except Exception as e:
                            logger.warning("Error disconnecting from room: %s", e)
                        
                        break
                        
                except asyncio.CancelledError:
                    logger.info("Time check task cancelled")
                    break
                except Exception as e:
                    logger.error("Error in time check task: %s", e)
                    # Continue checking even if one check fails
                    await asyncio.sleep(check_interval)

        # Start the time checking task
        time_check_task = asyncio.create_task(check_time_periodically())
        
        # Register participant disconnect handler to stop time check immediately
        @ctx.room.on("participant_disconnected")
        def on_participant_disconnect(participant_disconnected):
            nonlocal session_disconnected
            if participant_disconnected.identity == participant.identity:
                logger.info(f"Participant {participant.identity} disconnected, stopping time check immediately")
                session_disconnected = True
        
        # Clean up task when session ends
        async def cleanup_time_check():
            nonlocal session_disconnected
            session_disconnected = True
            if time_check_task and not time_check_task.done():
                time_check_task.cancel()
                try:
                    await time_check_task
                except asyncio.CancelledError:
                    pass
        
        ctx.add_shutdown_callback(cleanup_time_check)


if __name__ == "__main__":
    # Run the main LiveKit agent
    asyncio.run(test_postgres_connection())
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
