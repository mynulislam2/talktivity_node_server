"""
Database models and data classes.
Type-safe representations of database entities.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any


@dataclass
class UserProfile:
    """User onboarding profile data."""
    
    user_id: int
    current_level: Optional[str] = None
    industry: Optional[str] = None
    interests: Optional[List[str]] = None
    skill_to_improve: Optional[str] = None
    english_usage: Optional[List[str]] = None
    company: Optional[str] = None
    job_role: Optional[str] = None
    goals: Optional[List[str]] = None
    preferred_topics: Optional[List[str]] = None
    last_speaking_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {}
        for key, value in self.__dict__.items():
            if value is not None:
                if isinstance(value, datetime):
                    result[key] = value.isoformat()
                else:
                    result[key] = value
        return result
    
    @classmethod
    def from_db_row(cls, row: Dict[str, Any]) -> 'UserProfile':
        """Create UserProfile from database row."""
        return cls(**{k: v for k, v in row.items() if k in cls.__dataclass_fields__})


@dataclass
class SessionInfo:
    """Voice session information."""
    
    user_id: int
    session_type: str
    room_name: str
    prompt: str
    first_prompt: str
    start_time: datetime
    profile: Optional[UserProfile] = None
    
    @property
    def duration_seconds(self) -> int:
        """Calculate session duration in seconds."""
        return int((datetime.utcnow() - self.start_time).total_seconds())


@dataclass
class TranscriptData:
    """Transcript data to be saved."""
    
    room_name: str
    user_id: int
    session_type: str
    transcript: Dict[str, Any]
    duration_seconds: int
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class UsageRecord:
    """Session usage record."""
    
    user_id: int
    session_type: str
    duration_seconds: int
    usage_date: datetime = field(default_factory=lambda: datetime.utcnow().date())


@dataclass
class Subscription:
    """User subscription information."""
    
    user_id: int
    plan_type: str
    status: str
    start_date: datetime
    end_date: datetime
    is_free_trial: bool
    free_trial_started_at: Optional[datetime] = None
