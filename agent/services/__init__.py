"""
Services module for the Python agent.
Provides organized access to time limits, transcripts, socket/call cut events, and report generation.
"""

from .time_limit_service import (
    check_daily_time_limit,
    get_remaining_time_during_call,
)
from .transcript_service import (
    save_session_transcript,
    save_transcript_to_postgres,
    save_transcript_by_device_id,
)
from .socket_service import emit_call_cut_event
from .report_service import (
    generate_and_save_report,
    generate_report_with_groq,
    fetch_user_conversations,
    _get_connection,
    _flatten_transcripts,
)

__all__ = [
    # Time limit service
    "check_daily_time_limit",
    "get_remaining_time_during_call",
    # Transcript service
    "save_session_transcript",
    "save_transcript_to_postgres",
    "save_transcript_by_device_id",
    # Socket service
    "emit_call_cut_event",
    # Report service
    "generate_and_save_report",
    "generate_report_with_groq",
    "fetch_user_conversations",
    "_get_connection",
    "_flatten_transcripts",
]

