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
from services.current_transcript_store import set_current_transcript, remove_current_transcript
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
    session_type = "general"

    try:
        if participant.metadata and hasattr(participant.metadata, "__str__"):
            # Check if metadata is a string that can be parsed
            metadata_str = str(participant.metadata)
            if metadata_str and metadata_str != "MagicMock":
                import json

                metadata = json.loads(metadata_str)
                custom_prompt = metadata.get("prompt", "")
                first_prompt = metadata.get("firstPrompt", "")
                session_type = metadata.get("sessionType", "general")
                logger.info("Loaded metadata: %s", metadata)
            else:
                logger.info("Using default metadata (console mode)")
        else:
            logger.info("Using default metadata (console mode)")
    except (ValueError, TypeError) as e:
        logger.warning("Could not parse participant metadata: %s", e)
        # Use default values if metadata parsing fails

    # Enforce daily limit for non-test sessions only (server token TTL caps test to 5m)
    if session_type != "test" and participant.identity.startswith("user_"):
        user_id = int(participant.identity.replace("user_", ""))
        if not await check_daily_time_limit(user_id):
            logger.warning("Daily time limit exceeded for user %s", user_id)
            payload = {
                "type": "call_cut",
                "callCut": True,
                "reason": "time_limit",
                "message": "Daily time limit reached. Please upgrade your plan for more time.",
                "remaining": 0,
            }
            logger.info("Publishing call_cut (daily limit) to %s payload=%s", participant.identity, payload)
            await ctx.room.local_participant.publish_data(
                json.dumps(payload).encode("utf-8"),
                topic="system_message",
                reliable=True,
            )
            logger.info("Published call_cut (daily limit) to %s", participant.identity)
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
                        # Try to send a message via Socket.io
                        if participant.identity.startswith("user_"):
                            user_id = int(participant.identity.replace("user_", ""))
                            try:
                                async with httpx.AsyncClient() as client:
                                    await client.post(
                                        f"{API_URL}/api/agent/call-cut",
                                        json={
                                            "user_id": user_id,
                                            "reason": "quota_exhausted",
                                            "message": "Service temporarily unavailable. Please try again later.",
                                        },
                                        timeout=5.0,
                                    )
                            except Exception:
                                pass
                        
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
    session_start_time = datetime.now()
    
    # Store user_id if available (for storing current transcript)
    user_id = None
    if participant.identity.startswith("user_"):
        try:
            user_id = int(participant.identity.replace("user_", ""))
        except ValueError:
            pass

    async def write_transcript():
        # IMPORTANT: Store final transcript in memory BEFORE saving to DB
        # This ensures it's available for immediate report generation
        if user_id:
            try:
                transcript_data = session.history.to_dict()
                room_name = getattr(ctx.room, "name", f"test_call_{user_id}")
                transcript_data["room_name"] = room_name
                
                # Check if transcript has content before storing
                messages = transcript_data.get("messages", transcript_data.get("items", []))
                if messages and len(messages) > 0:
                    await set_current_transcript(user_id, transcript_data)
                    logger.info(
                        "Stored final transcript for user %s before saving to DB (items: %s)",
                        user_id,
                        len(messages),
                    )
                else:
                    logger.warning(
                        "Final transcript for user %s has no messages, skipping store",
                        user_id,
                    )
            except Exception as e:
                logger.warning("Error storing final transcript: %s", e)
        
        # Save transcript to database
        await save_session_transcript(
            session=session,
            ctx=ctx,
            participant=participant,
            session_type=session_type,
            session_start_time=session_start_time,
        )
        # NOTE: Don't remove from in-memory store here - let the report API remove it
        # after generating the report. This ensures it's available immediately after call ends.

    # Add the transcript saving function as a shutdown callback
    ctx.add_shutdown_callback(write_transcript)
    
    # Periodically update the current transcript in the store (every 5 seconds)
    async def update_current_transcript_periodically():
        """Update the current transcript in the store periodically."""
        if not user_id:
            return
        
        update_interval = 5  # Update every 5 seconds as fallback (events handle real-time)
        while True:
            try:
                await asyncio.sleep(update_interval)
                
                # Get current transcript from session
                try:
                    transcript_data = session.history.to_dict()
                    # Add room_name if available
                    room_name = getattr(ctx.room, "name", f"test_call_{user_id}")
                    transcript_data["room_name"] = room_name
                    
                    # Store in the in-memory store
                    await set_current_transcript(user_id, transcript_data)
                except Exception as e:
                    logger.debug("Error updating current transcript: %s", e)
                    # Continue even if update fails
                    
            except asyncio.CancelledError:
                logger.debug("Current transcript update task cancelled")
                break
            except Exception as e:
                logger.warning("Error in current transcript update task: %s", e)
                await asyncio.sleep(update_interval)
    
    # Start the periodic update task
    if user_id:
        transcript_update_task = asyncio.create_task(update_current_transcript_periodically())
        
        # Clean up task when session ends
        async def cleanup_transcript_update():
            if transcript_update_task and not transcript_update_task.done():
                transcript_update_task.cancel()
                try:
                    await transcript_update_task
                except asyncio.CancelledError:
                    pass
        
        ctx.add_shutdown_callback(cleanup_transcript_update)

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
    
    # Store initial transcript (empty at start, but sets up the store entry)
    if user_id:
        try:
            transcript_data = session.history.to_dict()
            room_name = getattr(ctx.room, "name", f"test_call_{user_id}")
            transcript_data["room_name"] = room_name
            await set_current_transcript(user_id, transcript_data)
            logger.debug("Stored initial transcript for user %s", user_id)
        except Exception as e:
            logger.debug("Error storing initial transcript: %s", e)
    
    # Real-time transcript update handler - updates store immediately when messages are added
    async def update_transcript_immediately():
        """Update transcript store immediately when conversation items are added."""
        if not user_id:
            return
        
        try:
            transcript_data = session.history.to_dict()
            room_name = getattr(ctx.room, "name", f"test_call_{user_id}")
            transcript_data["room_name"] = room_name
            await set_current_transcript(user_id, transcript_data)
            logger.debug(
                "Real-time transcript update for user %s (items: %s)",
                user_id,
                len(transcript_data.get("messages", transcript_data.get("items", []))),
            )
        except Exception as e:
            logger.debug("Error in real-time transcript update: %s", e)
            # Don't break the session if transcript update fails
    
    # Hook into conversation_item_added event for real-time transcript updates
    if user_id:
        @session.on("conversation_item_added")
        def on_conversation_item_added(event):
            """Event handler that updates transcript store immediately when messages are added."""
            # Schedule async update without blocking
            asyncio.create_task(update_transcript_immediately())
            logger.debug(
                "Conversation item added for user %s, updating transcript store",
                user_id,
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
                        
                        # Send call_cut event via Socket.io (Node.js backend)
                        try:
                            async with httpx.AsyncClient() as client:
                                response = await client.post(
                                    f"{API_URL}/api/agent/call-cut",
                                    json={
                                        "user_id": user_id,
                                        "reason": "time_limit",
                                        "message": "Time limit reached. Call ending...",
                                    },
                                    timeout=5.0,
                                )
                                if response.status_code == 200:
                                    logger.info("Emitted call_cut (time limit) via Socket.io for user %s", user_id)
                                else:
                                    logger.warning("Failed to emit call_cut event: %s", response.text)
                        except Exception as e:
                            logger.warning("Could not send call_cut event via Socket.io: %s", e)
                        
                        # Disconnect by closing the session
                        session_disconnected = True
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


