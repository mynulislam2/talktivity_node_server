"""
Transcript service for saving session transcripts to database.
Matches Node.js transcriptService.js functionality.
"""

from datetime import datetime

from services.session_transcripts import save_session_transcript
from db import (
    save_transcript_to_postgres,
    save_transcript_by_device_id,
)

# Re-export functions for easier imports
__all__ = [
    "save_session_transcript",
    "save_transcript_to_postgres",
    "save_transcript_by_device_id",
]

