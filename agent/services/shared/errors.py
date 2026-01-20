"""
Custom exception classes for the voice agent.
Provides clear error handling and categorization.
"""


class TalktivityError(Exception):
    """Base exception for all Talktivity errors."""
    pass


class ConfigurationError(TalktivityError):
    """Configuration or environment variable errors."""
    pass


class SessionError(TalktivityError):
    """Session-related errors (initialization, state, etc.)."""
    pass


class DatabaseError(TalktivityError):
    """Database operation errors."""
    pass


class TimeLimitError(SessionError):
    """Time limit exceeded for session."""
    
    def __init__(self, message: str = "Time limit exceeded", session_type: str = ""):
        self.session_type = session_type
        super().__init__(message)


class TranscriptError(TalktivityError):
    """Transcript processing or saving errors."""
    pass


class AuthenticationError(TalktivityError):
    """Authentication or authorization errors."""
    pass
