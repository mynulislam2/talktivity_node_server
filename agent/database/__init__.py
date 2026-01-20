"""
Database module with connection pooling and repositories.
Provides clean data access layer with type safety.
"""

from .connection import DatabasePool, test_connection
from .models import (
    UserProfile,
    SessionInfo,
    TranscriptData,
    UsageRecord,
    Subscription,
)
from .repositories import (
    UserRepository,
    TranscriptRepository,
    UsageRepository,
    SubscriptionRepository,
    CourseRepository,
)

__all__ = [
    # Connection
    "DatabasePool",
    "test_connection",
    # Models
    "UserProfile",
    "SessionInfo",
    "TranscriptData",
    "UsageRecord",
    "Subscription",
    # Repositories
    "UserRepository",
    "TranscriptRepository",
    "UsageRepository",
    "SubscriptionRepository",
    "CourseRepository",
]
