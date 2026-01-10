"""
Time limit service for checking daily time limits and remaining time during calls.
Matches Node.js timeLimitService.js functionality.
"""

from datetime import datetime

from db import check_daily_time_limit, get_remaining_time_during_call

# Re-export functions for easier imports
__all__ = ["check_daily_time_limit", "get_remaining_time_during_call"]

