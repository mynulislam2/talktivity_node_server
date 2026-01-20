"""
Session management for the Talktivity voice assistant.
Handles session initialization, configuration, and lifecycle management.
"""

import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any, Tuple

from livekit.agents import AgentSession, JobContext
from livekit.plugins import google, silero
from livekit.plugins.turn_detector.english import EnglishModel

from config import Config
from database import UserRepository, DatabasePool
from services import TimeLimitService, get_logger

logger = get_logger(__name__)


class SessionManager:
    """
    Manages LiveKit agent session lifecycle including:
    - Metadata extraction and validation
    - User profile enrichment
    - Time limit checks
    - Session configuration (STT, TTS, LLM)
    """

    def __init__(self, config: Config, db_pool: DatabasePool):
        """
        Initialize session manager.
        
        Args:
            config: Application configuration
            db_pool: Database connection pool
        """
        self.config = config
        self.db_pool = db_pool
        self.user_repo = UserRepository(db_pool)
        self.time_limit_service = TimeLimitService(db_pool)

    async def extract_metadata(self, participant) -> Tuple[Optional[int], str, str, str, str]:
        """
        Extract and validate metadata from participant.
        
        Args:
            participant: LiveKit participant object
            
        Returns:
            Tuple of (user_id, custom_prompt, first_prompt, session_type, room_name)
        """
        user_id = None
        custom_prompt = ""
        first_prompt = ""
        session_type = "call"
        room_name = f"room_{datetime.utcnow().timestamp()}"

        try:
            if participant.metadata and hasattr(participant.metadata, "__str__"):
                metadata_str = str(participant.metadata)
                if metadata_str and metadata_str != "MagicMock":
                    metadata = json.loads(metadata_str)
                    
                    user_id = metadata.get("userId")
                    custom_prompt = metadata.get("prompt", "")
                    first_prompt = metadata.get("firstPrompt", "")
                    session_type = metadata.get("sessionType", "call")
                    
                    logger.info("User ID: %s, Session Type: %s", user_id, session_type)
        except (ValueError, TypeError) as e:
            logger.warning("Could not parse participant metadata: %s", e)

        # Normalize session type
        if session_type not in {"call", "practice", "roleplay"}:
            session_type = "call"

        return user_id, custom_prompt, first_prompt, session_type, room_name

    async def enrich_with_profile(self, user_id: int, custom_prompt: str) -> str:
        """
        Fetch user onboarding data and enrich the custom prompt.
        
        Args:
            user_id: User identifier
            custom_prompt: Existing custom prompt
            
        Returns:
            Enriched prompt with user profile information
        """
        try:
            profile = await self.user_repo.get_profile(user_id)
            if profile:
                profile_context = f"\nUser Profile: {json.dumps(profile.to_dict())}"
                return custom_prompt + profile_context if custom_prompt else profile_context
        except Exception as e:
            logger.warning("Could not fetch user profile for user %s: %s", user_id, e)
        
        return custom_prompt

    async def check_time_limit(self, user_id: int, session_type: str) -> bool:
        """
        Check if user has time remaining for this session type.
        
        Args:
            user_id: User identifier
            session_type: Type of session (call, practice, roleplay)
            
        Returns:
            True if user can start session, False otherwise
        """
        try:
            can_start = await self.time_limit_service.check_can_start_session(
                user_id, session_type
            )
            if not can_start:
                logger.warning(
                    "Time limit exceeded for user %s (%s)", user_id, session_type
                )
            return can_start
        except Exception as e:
            logger.error("Error checking time limit for user %s: %s", user_id, e)
            return False

    def create_session(self, ctx: JobContext, google_api_key: str) -> AgentSession:
        """
        Create and configure LiveKit AgentSession.
        
        Args:
            ctx: Job context containing VAD userdata
            google_api_key: Google API key for LLM/STT/TTS
            
        Returns:
            Configured AgentSession instance
        """
        llm_instance = google.LLM(
            model="gemini-2.0-flash-exp",
            temperature=1,
            vertexai=False,
            api_key=google_api_key if google_api_key else None,
        )

        session = AgentSession(
            vad=ctx.proc.userdata["vad"],
            stt=google.STT(model="latest_long"),
            llm=llm_instance,
            tts=google.TTS(
                voice_name="en-US-Chirp3-HD-Kore",
                language="en-US",
                sample_rate=24000,
            ),
            turn_detection=EnglishModel(),
            allow_interruptions=True,
            min_endpointing_delay=0.1,
            max_endpointing_delay=0.3,
        )

        return session, llm_instance

    def get_session_info(
        self,
        user_id: Optional[int],
        session_type: str,
        room_name: str,
        start_time: datetime,
    ) -> Dict[str, Any]:
        """
        Create session info dictionary for handlers.
        
        Args:
            user_id: User identifier
            session_type: Type of session
            room_name: LiveKit room name
            start_time: Session start timestamp
            
        Returns:
            Dictionary containing session information
        """
        return {
            "user_id": user_id,
            "session_type": session_type,
            "room_name": room_name,
            "start_time": start_time,
            "saving_emitted": False,
            "session_save_handled": False,
            "session_disconnected": False,
        }
