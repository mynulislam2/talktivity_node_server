"""
Configuration module for the voice agent.
Provides centralized, type-safe configuration management.
"""

from .base import (
    Config,
    DatabaseConfig,
    GoogleConfig,
    SecurityConfig,
    ApiConfig,
)
from .constants import (
    SESSION_TYPE_CALL,
    SESSION_TYPE_PRACTICE,
    SESSION_TYPE_ROLEPLAY,
    SUPPORTED_SESSION_TYPES,
    CALL_LIFETIME_LIMIT_SECONDS,
    PRACTICE_DAILY_CAP_SECONDS,
    ROLEPLAY_BASIC_CAP_SECONDS,
    ROLEPLAY_PRO_CAP_SECONDS,
    SESSION_STATE_SAVING,
    SESSION_STATE_SAVED,
    SESSION_STATE_FAILED,
    TIME_CHECK_INTERVAL_SECONDS,
    SPEAKING_COMPLETION_THRESHOLD_SECONDS,
    PLAN_TYPE_PRO,
    PLAN_TYPE_BASIC,
    PLAN_TYPE_FREE_TRIAL,
)
from .loaders import (
    load_environment,
    validate_google_credentials,
    log_configuration_summary,
)

__all__ = [
    # Configuration classes
    "Config",
    "DatabaseConfig",
    "GoogleConfig",
    "SecurityConfig",
    "ApiConfig",
    # Constants
    "SESSION_TYPE_CALL",
    "SESSION_TYPE_PRACTICE",
    "SESSION_TYPE_ROLEPLAY",
    "SUPPORTED_SESSION_TYPES",
    "CALL_LIFETIME_LIMIT_SECONDS",
    "PRACTICE_DAILY_CAP_SECONDS",
    "ROLEPLAY_BASIC_CAP_SECONDS",
    "ROLEPLAY_PRO_CAP_SECONDS",
    "SESSION_STATE_SAVING",
    "SESSION_STATE_SAVED",
    "SESSION_STATE_FAILED",
    "TIME_CHECK_INTERVAL_SECONDS",
    "SPEAKING_COMPLETION_THRESHOLD_SECONDS",
    "PLAN_TYPE_PRO",
    "PLAN_TYPE_BASIC",
    "PLAN_TYPE_FREE_TRIAL",
    # Loaders
    "load_environment",
    "validate_google_credentials",
    "log_configuration_summary",
]
