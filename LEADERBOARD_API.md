# Leaderboard API Documentation

## Overview
The Leaderboard API provides endpoints to retrieve user rankings based on XP (Experience Points) and levels. The system calculates XP based on:
- Speaking sessions (10 XP per session)
- Quiz completions (15 XP per quiz)
- Weekly exams (50 XP per exam)
- Streak bonuses (5 XP per day in streak)

**Note**: The leaderboard uses session count for XP calculation, while other parts of the system (achievements, user progress) use speaking time-based session calculation (5 minutes = 1 session).

## Endpoints

### 1. Get Weekly Leaderboard
**GET** `/api/leaderboard/weekly`

Returns the top 50 users ranked by their XP earned in the current week (Monday to Sunday).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "position": 1,
        "id": 123,
        "name": "John Doe",
        "profile_picture": "https://example.com/avatar.jpg",
        "level": 15,
        "xp": 1250,
        "isCrown": true
      }
    ],
    "weekStart": "2024-01-15",
    "weekEnd": "2024-01-21",
    "totalParticipants": 25
  }
}
```

### 2. Get Overall Leaderboard
**GET** `/api/leaderboard/overall`

Returns the top 50 users ranked by their total XP earned across all time.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "position": 1,
        "id": 123,
        "name": "John Doe",
        "profile_picture": "https://example.com/avatar.jpg",
        "level": 25,
        "xp": 2500,
        "isCrown": true
      }
    ],
    "totalParticipants": 50
  }
}
```

### 3. Get User Position
**GET** `/api/leaderboard/my-position?type=weekly`

Returns the current user's position and stats in the leaderboard.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `type` (optional): `weekly` or `overall` (default: `weekly`)

**Response:**
```json
{
  "success": true,
  "data": {
    "position": 5,
    "user": {
      "id": 123,
      "name": "John Doe",
      "profile_picture": "https://example.com/avatar.jpg",
      "level": 15,
      "xp": 1250,
      "xpForNextLevel": 1600,
      "xpProgress": 50
    },
    "type": "weekly"
  }
}
```

## XP Calculation Formula

### Leaderboard XP Calculation
The leaderboard uses session count for XP calculation:
```
Total XP = (Sessions × 10) + (Quizzes × 15) + (Exams × 50) + (Streak Days × 5)
```

### User Progress XP Calculation
Other parts of the system (achievements, user progress) use speaking time-based session calculation:
```
Sessions = Floor(Total Speaking Time in Seconds / 300)
Total XP = (Sessions × 10) + (Quizzes × 15) + (Exams × 50) + (Streak Days × 5)
```

Where:
- **Sessions**: 
  - Leaderboard: Number of days with completed speaking sessions
  - User Progress: Total speaking time divided by 5 minutes (300 seconds)
- **Quizzes**: Number of quizzes completed successfully
- **Exams**: Number of weekly exams passed
- **Streak Days**: Current consecutive days of activity

## Level Calculation

User levels are calculated as:
```
Level = Floor(Total XP / 100) + 1
```

## Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Access denied. Invalid or missing token."
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Failed to get weekly leaderboard"
}
```

## Frontend Integration

The frontend uses the `LeaderboardService` class to interact with these endpoints:

```typescript
import { leaderboardService } from '@/service/LeaderboardService';

// Get weekly leaderboard
const weeklyData = await leaderboardService.getWeeklyLeaderboard();

// Get overall leaderboard
const overallData = await leaderboardService.getOverallLeaderboard();

// Get user position
const positionData = await leaderboardService.getMyPosition('weekly');
```

## Notes

- Only non-admin users are included in leaderboards
- Users with 0 XP are excluded from leaderboards
- The crown emoji (👑) is automatically assigned to the first-place user
- Weekly leaderboards reset every Monday at 00:00
- Profile pictures fall back to a default avatar if not provided
- **Important**: Leaderboard uses session count, while user progress uses speaking time (5 minutes = 1 session)
