"""
Socket service for emitting call cut events.
Note: Python agent uses LiveKit's publish_data instead of Socket.io,
which is already implemented in minimal_assistant.py.
This module provides a helper function for consistency.
"""

import json
from typing import Optional

from livekit import rtc


async def emit_call_cut_event(
    room: rtc.Room,
    participant_identity: str,
    reason: str,
    message: str,
) -> None:
    """
    Emit call cut event via LiveKit's publish_data (replaces Socket.io).
    This is the Python equivalent of Node.js socketService.emitCallCutEvent().
    
    Args:
        room: LiveKit room instance
        participant_identity: Participant identity string
        reason: Reason for call cut ('time_limit', 'manual', 'error', 'quota_exhausted')
        message: Message to display to user
    """
    try:
        payload = {
            "type": "call_cut",
            "callCut": True,
            "reason": reason,
            "message": message,
            "remaining": 0,
        }
        
        # Publish data to room (frontend listens via LiveKit data channel)
        await room.local_participant.publish_data(
            json.dumps(payload).encode("utf-8"),
            topic="system_message",
            reliable=True,
        )
        
        print(f"✅ Published call_cut event to {participant_identity}: {reason}")
    except Exception as e:
        print(f"❌ Error publishing call_cut event to {participant_identity}: {e}")


__all__ = ["emit_call_cut_event"]

