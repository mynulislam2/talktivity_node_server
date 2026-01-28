# Database Lifecycle & Usage Migration

This directory contains migrations and scripts to align the backend with the new time-gating and lifecycle design.

## New Tables & Changes
- `user_lifecycle` (1:1 with `users`): Centralizes flags and lifetime call tracking
  - Columns: `onboarding_completed`, `onboarding_test_call_used`, `call_completed`, `report_completed`, `lifetime_call_seconds`, `lifetime_call_cap_seconds` (default 300)
- `daily_usage` (existing): Remains the source for per-day practice/roleplay tracking
- `daily_progress` (existing): Kept for course flags; no call fields. Migration 023 defensively drops any legacy call columns if present.

## Migrations
- 022_create_user_lifecycle_and_extend_daily_progress.sql: Adds `user_lifecycle`
- 023_adjust_daily_progress_drop_call_fields.sql: Drops any legacy call columns from `daily_progress` if they exist

Run all migrations:

```bash
cd Agentserver
npm run db:run-migrations
```

## Backfill
Populate `user_lifecycle` from legacy tables/columns:

```bash
cd Agentserver
npm run db:backfill-lifecycle
```

Backfill logic:
- Pulls booleans from `users` when columns exist: `onboarding_completed`, `onboarding_test_call_used`, `call_completed`, `report_completed`
- Aggregates `lifetime_call_seconds` from `lifetime_call_usage` or falls back to `device_speaking_sessions`
- Upserts rows for all users

## Route Updates
- Usage endpoints now read lifetime call limits from `user_lifecycle`
- Conversation save increments `user_lifecycle.lifetime_call_seconds` using `session_duration`

## Next Steps
- Once verified, consider deprecating `lifetime_call_usage` and related flags on `users`
- Ensure the Python agent includes `session_duration` in `/api/conversations` payload (already supported)