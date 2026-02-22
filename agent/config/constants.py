"""
Runtime constants for the voice agent.
Time limits, session types, and other fixed values.
"""

# Session Types
SESSION_TYPE_CALL = "call"
SESSION_TYPE_PRACTICE = "practice"
SESSION_TYPE_ROLEPLAY = "roleplay"
SUPPORTED_SESSION_TYPES = {SESSION_TYPE_CALL, SESSION_TYPE_PRACTICE, SESSION_TYPE_ROLEPLAY}

# FREE TRIAL CONFIGURATION
FREE_TRIAL_DURATION_DAYS = 3  # Free trial valid for 3 days

# Time Limits (in seconds)
CALL_LIFETIME_LIMIT_SECONDS = 2 * 60  # 2 minutes lifetime for test call
PRACTICE_DAILY_CAP_SECONDS = 5 * 60   # 5 minutes per day for practice (Basic/FreeTrial)
PRACTICE_PRO_CAP_SECONDS = 10 * 60    # 10 minutes per day for practice (Pro)
ROLEPLAY_BASIC_CAP_SECONDS = 5 * 60   # 5 minutes per day for Basic plan (separate from practice)
ROLEPLAY_PRO_CAP_SECONDS = 10 * 60    # 10 minutes per day for Pro plan (separate from practice)

# Session State Events
SESSION_STATE_SAVING = "SAVING_CONVERSATION"
SESSION_STATE_SAVED = "SESSION_SAVED"
SESSION_STATE_FAILED = "SESSION_SAVE_FAILED"

# Time Check Interval
TIME_CHECK_INTERVAL_SECONDS = 10  # Check remaining time every 10 seconds

# Course Progress Threshold
SPEAKING_COMPLETION_THRESHOLD_SECONDS = 5 * 60  # 5 minutes required for daily completion

# Subscription Plan Types
PLAN_TYPE_PRO = "Pro"
PLAN_TYPE_BASIC = "Basic"
PLAN_TYPE_FREE_TRIAL = "FreeTrial"
