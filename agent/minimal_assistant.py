"""
Talktivity Voice Assistant Agent - Main Entry Point

This file serves as a backward-compatible entry point for the LiveKit agent.
The actual implementation has been refactored into the core/ module for better
maintainability and organization.

For the new modular implementation, see:
- core/entrypoint.py: Main orchestration logic
- core/session_manager.py: Session lifecycle management
- core/handlers.py: Event handlers (LLM errors, time checks, transcript saving)
"""

from livekit.agents import WorkerOptions, cli
from core.entrypoint import prewarm, entrypoint

# Re-export for backward compatibility
__all__ = ["prewarm", "entrypoint"]


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm))
