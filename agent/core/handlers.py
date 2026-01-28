"""
Event handlers for the Talktivity voice assistant.
Handles LLM errors, time limit checks, and transcript saving.
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional

from livekit.agents import AgentSession, JobContext

from config import Config, SESSION_STATE_SAVING
from database import DatabasePool, UsageRepository
from services import (
    TimeLimitService,
    TranscriptService,
    emit_session_state,
    emit_session_save_failed,
    emit_saving_conversation,
    emit_session_saved,
    get_logger,
)
from utils.timezone import get_utc_now

logger = get_logger(__name__)


class LLMErrorHandler:
    """Handles LLM errors, especially quota exhaustion (429 errors)."""

    def __init__(self, session: AgentSession, ctx: JobContext, config: Config, session_info: Dict[str, Any]):
        """
        Initialize LLM error handler.
        
        Args:
            session: AgentSession instance
            ctx: Job context
            config: Application configuration
            session_info: Session information dictionary
        """
        self.session = session
        self.ctx = ctx
        self.config = config
        self.session_info = session_info
        self.quota_exhausted = False

    async def handle_error(self, error: Exception):
        """
        Handle LLM errors, especially quota exhaustion (429 errors).
        
        Args:
            error: The error that occurred
        """
        error_str = str(error)
        
        # Check if it's a 429 quota exhaustion error
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "Too Many Requests" in error_str:
            if not self.quota_exhausted:
                self.quota_exhausted = True
                logger.error(
                    "Google API quota exhausted (429). The agent will disconnect. "
                    "Please check your Google Cloud API quotas or service account limits."
                )
                
                # Emit session save failed for quota exhaustion
                user_id = self.session_info.get("user_id")
                if user_id:
                    await emit_session_save_failed(
                        user_id=user_id,
                        api_url=self.config.api.node_api_url,
                        call_id=self.session_info.get("room_name"),
                        error_message="Service temporarily unavailable. Please try again later.",
                    )
                
                # Close the session
                try:
                    await self.session.aclose()
                except Exception as e:
                    logger.warning("Error closing session on quota exhaustion: %s", e)
        else:
            logger.warning("LLM error (non-quota): %s", error)


class TimeCheckHandler:
    """Handles periodic time limit checks during active sessions."""

    def __init__(
        self,
        session: AgentSession,
        ctx: JobContext,
        db_pool: DatabasePool,
        config: Config,
        session_info: Dict[str, Any],
    ):
        """
        Initialize time check handler.
        
        Args:
            session: AgentSession instance
            ctx: Job context
            db_pool: Database connection pool
            config: Application configuration
            session_info: Session information dictionary
        """
        self.session = session
        self.ctx = ctx
        self.config = config
        self.session_info = session_info
        self.time_limit_service = TimeLimitService(db_pool)
        self.check_interval = 10  # Check every 10 seconds
        self.task: Optional[asyncio.Task] = None

    async def check_periodically(self):
        """Check remaining time every 10 seconds and disconnect if time runs out."""
        user_id = self.session_info["user_id"]
        session_type = self.session_info["session_type"]
        start_time = self.session_info["start_time"]
        
        # For call sessions, use call_start_time if available (stored in memory)
        call_start_time = self.session_info.get("call_start_time")
        if session_type == "call" and call_start_time:
            start_time = call_start_time

        while not self.session_info["session_disconnected"]:
            try:
                await asyncio.sleep(self.check_interval)
                
                # Double-check if session is still active
                if self.session_info["session_disconnected"]:
                    logger.info("Session already disconnected, stopping time check")
                    break
                
                # Calculate elapsed time in memory (NO database query for elapsed time)
                elapsed_seconds = int((get_utc_now() - start_time).total_seconds())
                
                # For call sessions, check lifetime limit using existing sessions only
                if session_type == "call":
                    remaining = await self.time_limit_service.get_remaining_lifetime_time(
                        user_id, elapsed_seconds
                    )
                else:
                    # For practice/roleplay, use existing logic
                    remaining = await self.time_limit_service.get_remaining_time_during_session(
                        user_id, session_type, elapsed_seconds
                    )
                
                logger.info(
                    "Time check - User %s, Session: %s, Duration: %ss, Remaining: %ss",
                    user_id,
                    session_type,
                    elapsed_seconds,
                    remaining,
                )
                
                # If time runs out, disconnect gracefully
                if remaining <= 0:
                    logger.warning(
                        "Time limit reached for user %s. Disconnecting call.", user_id
                    )
                    
                    # Mark session as disconnected
                    self.session_info["session_disconnected"] = True
                    
                    # Signal to frontend that time is up
                    await emit_session_state(
                        user_id=user_id,
                        state=SESSION_STATE_SAVING,
                        api_url=self.config.api.node_api_url,
                        call_id=self.session_info.get("room_name"),
                        message="Daily time limit reached for this session type. Saving your conversation…",
                    )
                    self.session_info["saving_emitted"] = True

                    # Close the session - triggers shutdown callback (write_transcript)
                    try:
                        await self.session.aclose()
                    except Exception as e:
                        logger.warning("Error closing session: %s", e)
                    
                    # Disconnect from room
                    try:
                        await self.ctx.room.disconnect()
                    except Exception as e:
                        logger.warning("Error disconnecting from room: %s", e)
                    
                    break
                    
            except asyncio.CancelledError:
                logger.info("Time check task cancelled")
                break
            except Exception as e:
                logger.error("Error in time check task: %s", e)
                # Continue checking even if one check fails
                await asyncio.sleep(self.check_interval)

    def start(self):
        """Start the periodic time checking task."""
        self.task = asyncio.create_task(self.check_periodically())

    async def stop(self):
        """Stop the time checking task."""
        self.session_info["session_disconnected"] = True
        if self.task and not self.task.done():
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass


class TranscriptSaveHandler:
    """Handles saving session transcripts when the session ends."""

    def __init__(
        self,
        session: AgentSession,
        ctx: JobContext,
        db_pool: DatabasePool,
        config: Config,
        session_info: Dict[str, Any],
        participant,
    ):
        """
        Initialize transcript save handler.
        
        Args:
            session: AgentSession instance
            ctx: Job context
            db_pool: Database connection pool
            config: Application configuration
            session_info: Session information dictionary
            participant: LiveKit participant object
        """
        self.session = session
        self.ctx = ctx
        self.config = config
        self.session_info = session_info
        self.participant = participant
        self.transcript_service = TranscriptService(db_pool)

    async def save_transcript(self):
        """
        Save the transcript when the session ends.
        Emits SESSION_STATE events to frontend:
        1. SAVING_CONVERSATION - before saving
        2. SESSION_SAVED or SESSION_SAVE_FAILED - after save attempt
        """
        # Prevent duplicate saves
        if self.session_info["session_save_handled"]:
            logger.info("Session save already handled, skipping duplicate")
            return
        self.session_info["session_save_handled"] = True
        
        user_id = self.session_info["user_id"]
        room_name = self.session_info["room_name"]
        
        # Step 1: Emit SAVING_CONVERSATION state to frontend
        if user_id and not self.session_info["saving_emitted"]:
            logger.info("📤 Emitting SAVING_CONVERSATION for user %s", user_id)
            await emit_saving_conversation(user_id=user_id, api_url=self.config.api.node_api_url, call_id=room_name)
            self.session_info["saving_emitted"] = True
        
        # Get transcript from session
        try:
            transcript_data = self.session.history.to_dict()
        except Exception as e:
            logger.error("Error getting transcript data: %s", e)
            if user_id:
                await emit_session_save_failed(
                    user_id=user_id,
                    api_url=self.config.api.node_api_url,
                    call_id=room_name,
                    error_message="Failed to retrieve conversation data.",
                )
            return
        
        # Save transcript to database
        try:
            # Calculate duration from memory (for call sessions, use call_start_time)
            session_type = self.session_info["session_type"]
            if session_type == "call" and "call_start_time" in self.session_info:
                call_start_time = self.session_info["call_start_time"]
                call_ended_at = get_utc_now()
                duration_seconds = int((call_ended_at - call_start_time).total_seconds())
            else:
                start_time = self.session_info.get("start_time", get_utc_now())
                duration_seconds = int((get_utc_now() - start_time).total_seconds())
            
            save_success = await self.transcript_service.save_session_transcript(
                user_id=user_id,
                room_name=room_name,
                session_type=session_type,
                transcript=transcript_data,
                duration_seconds=duration_seconds,
                session_info=self.session_info,  # Pass session_info for call_start_time
            )
        except Exception as e:
            logger.error("Error saving transcript: %s", e)
            save_success = False
        
        # Step 3: Emit SESSION_SAVED or SESSION_SAVE_FAILED based on result
        if user_id:
            if save_success:
                logger.info("📤 Emitting SESSION_SAVED for user %s", user_id)
                await emit_session_saved(user_id=user_id, api_url=self.config.api.node_api_url, call_id=room_name)
            else:
                logger.error("📤 Emitting SESSION_SAVE_FAILED for user %s", user_id)
                await emit_session_save_failed(
                    user_id=user_id,
                    api_url=self.config.api.node_api_url,
                    call_id=room_name,
                    error_message="Failed to save conversation to database. Please try again.",
                )
