"""
Services module for the Python agent.
Provides organized access to time limits, transcripts, and session state events.
"""

from .time_limit_checker import TimeLimitService
from .transcript_saver import TranscriptService
from .socket_service import (
    emit_session_state,
    emit_saving_conversation,
    emit_session_saved,
    emit_session_save_failed,
)
from .shared import (
    TalktivityError,
    ConfigurationError,
    SessionError,
    DatabaseError,
    TimeLimitError,
    TranscriptError,
    AuthenticationError,
    setup_logging,
    get_logger,
)

__all__ = [
    # Services
    "TimeLimitService",
    "TranscriptService",
    # Socket/session state
    "emit_session_state",
    "emit_saving_conversation",
    "emit_session_saved",
    "emit_session_save_failed",
    # Errors
    "TalktivityError",
    "ConfigurationError",
    "SessionError",
    "DatabaseError",
    "TimeLimitError",
    "TranscriptError",
    "AuthenticationError",
    # Logging
    "setup_logging",
    "get_logger",
]

