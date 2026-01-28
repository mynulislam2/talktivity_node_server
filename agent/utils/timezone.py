"""
Timezone utility functions for UTC operations.
Ensures all datetime operations use UTC regardless of system timezone.
"""

from datetime import datetime, timezone, date
from typing import Optional


def get_utc_now() -> datetime:
    """
    Get current UTC datetime (timezone-aware).
    
    Returns:
        datetime: Current UTC datetime with timezone info
    """
    return datetime.now(timezone.utc)


def get_utc_today() -> date:
    """
    Get today's date in UTC timezone.
    
    Returns:
        date: Today's date in UTC
    """
    return get_utc_now().date()


def to_utc_datetime(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Convert a datetime to UTC timezone-aware datetime.
    
    Args:
        dt: Datetime object (naive or timezone-aware)
        
    Returns:
        datetime: UTC timezone-aware datetime, or None if input is None
    """
    if dt is None:
        return None
    
    if dt.tzinfo is None:
        # Naive datetime - assume it's UTC
        return dt.replace(tzinfo=timezone.utc)
    else:
        # Timezone-aware datetime - convert to UTC
        return dt.astimezone(timezone.utc)


def to_utc_date_string(dt: Optional[datetime] = None) -> str:
    """
    Convert datetime to UTC date string (YYYY-MM-DD format).
    
    Args:
        dt: Datetime object (defaults to current UTC time)
        
    Returns:
        str: Date string in YYYY-MM-DD format
    """
    if dt is None:
        dt = get_utc_now()
    else:
        dt = to_utc_datetime(dt)
    
    return dt.date().isoformat()
