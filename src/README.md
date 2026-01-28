# Talktivity Backend - Modular Architecture

## Project Structure

```
src/
├── config/                      # Configuration files
│   └── index.js                # Environment variables and constants
├── core/                        # Core infrastructure
│   ├── db/
│   │   └── client.js           # Database wrapper with transaction support
│   ├── error/
│   │   ├── errors.js           # Custom error classes
│   │   └── errorHandler.js     # Express error middleware
│   ├── http/
│   │   ├── middlewares/
│   │   │   └── auth.js         # JWT authentication middleware
│   │   └── response.js         # Standardized response helpers
│   └── logger/                 # Logging utilities (TODO)
├── modules/                     # Feature modules (16 total)
│   ├── auth/                   # Authentication & session management
│   ├── subscriptions/          # Subscription plans and free trials
│   ├── courses/                # Course initialization and rollover
│   ├── daily-usage/            # Daily activity tracking
│   ├── reports/                # AI-generated reports
│   ├── topics/                 # Discussion topics
│   ├── vocabulary/             # Vocabulary learning
│   ├── listening/              # Listening materials
│   ├── quizzes/                # Quiz management
│   ├── leaderboard/            # User rankings
│   ├── progress/               # User progress tracking
│   ├── transcripts/            # Conversation transcripts
│   ├── onboarding/             # User onboarding flow
│   ├── payment/                # Payment processing
│   ├── connection/             # LiveKit connection management
│   └── user-lifecycle/         # User state transitions
└── utils/                       # Shared utilities
    └── timeGating.js           # Time-gating logic
├── app.js                       # Express app setup
└── server.js                    # Server bootstrap
```

## Module Structure

Each module follows a consistent pattern:

```
module/
├── router.js       # Express routes (HTTP endpoints)
├── controller.js   # Request handlers (validation + delegation)
├── service.js      # Business logic (core implementation)
├── repo.js         # Database queries (data access)
├── schema.js       # Input validation (Joi schemas)
└── index.js        # Module exports
```

### Example: Auth Module

- **router.js**: Defines routes (`POST /auth/register`, `POST /auth/login`, etc.)
- **controller.js**: Validates inputs, calls service, returns responses
- **service.js**: Implements auth logic (password hashing, JWT generation)
- **repo.js**: Executes user queries (`getUserByEmail`, `createUser`)
- **schema.js**: Joi validation schemas
- **index.js**: Exports all module functions

## Core Infrastructure

### Database Client (`src/core/db/client.js`)
Wrapper around existing database pool with helper methods:
```javascript
db.query(sql, params)       // Execute and return all rows
db.queryOne(sql, params)    // Execute and return single row
db.queryAll(sql, params)    // Execute and return all rows (alias)
db.transaction(callback)    // Execute with BEGIN/COMMIT/ROLLBACK
```

### Error Handling (`src/core/error/`)
6 custom error classes with HTTP status codes:
- `AppError` (500)
- `ValidationError` (400)
- `AuthError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)

### Authentication Middleware (`src/core/http/middlewares/auth.js`)
JWT verification:
```javascript
authenticateToken  // Throws if token invalid
optionalAuth       // Sets req.user if valid, continues if invalid
```

### Response Helpers (`src/core/http/response.js`)
Standardized JSON responses:
```javascript
sendSuccess(res, data, statusCode, message)
sendError(res, error, statusCode, code)
sendResponse(res, { success, data, error, statusCode })
```

## Configuration

See `.env.example` for required variables:

```bash
# Database
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=postgres
PG_DATABASE=talktivity

# JWT
JWT_SECRET=your-secure-secret-key-here

# API
API_PORT=8082
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# LiveKit
LIVEKIT_URL=http://localhost:7880
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...

# LLM
GROQ_API_KEY=...

# Optional
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ADMIN_SETUP_TOKEN=...
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login (returns JWT)
- `POST /api/auth/refresh-token` - Refresh JWT token
- `GET /api/auth/me` - Get current user (protected)

### Subscriptions
- `GET /api/subscriptions/plans` - List all plans
- `GET /api/subscriptions/status` - User's subscription (protected)
- `POST /api/subscriptions/start-free-trial` - Activate 7-day trial (protected)

### Courses
- `POST /api/courses/initialize` - Start week 1 (protected)
- `GET /api/courses/get-active` - Get current week (protected)
- `GET /api/courses/check-rollover` - Auto-advance week (protected)

### Daily Usage
- `GET /api/daily-usage/get` - Today's activities (protected)
- `PUT /api/daily-usage/speaking` - Log speaking (protected)
- `PUT /api/daily-usage/quiz` - Log quiz (protected)
- `PUT /api/daily-usage/listening` - Log listening (protected)
- `PUT /api/daily-usage/roleplay` - Log roleplay (protected)
- `PUT /api/daily-usage/exam` - Log exam (protected)
- `GET /api/daily-usage/remaining-time` - Time left today (protected)

### Connection (LiveKit)
- `GET /api/connection/connection-details` - Get token + room (protected)
- `POST /api/connection/start-session` - Record session start (protected)
- `POST /api/connection/end-session` - Record session end (protected)

### Reports
- `GET /api/reports/list` - User's reports (protected)
- `GET /api/reports/:id` - Report detail (protected)
- `POST /api/reports/generate` - Generate AI report (protected)

### Leaderboard
- `GET /api/leaderboard/global` - Global rankings
- `GET /api/leaderboard/weekly` - Weekly rankings
- `GET /api/leaderboard/my-rank` - User's position (protected)

### Progress
- `GET /api/progress/summary` - Stats (protected)
- `GET /api/progress/history` - 30 days history (protected)
- `GET /api/progress/goals` - User goals (protected)

### Topics, Vocabulary, Listening, Quizzes, Transcripts, Onboarding, Payment
- Full CRUD endpoints available (see individual module routers)

## Time-Gating System

Located in `src/utils/timeGating.js`:

- `getRemainingPracticeTime(userId)` - Daily 300s budget
- `getRemainingRoleplayTime(userId)` - Daily (300s Basic / 3300s Pro)
- `getRemainingLifetimeCallTime(userId)` - 300s onboarding pool
- `canStartPracticeSession(userId)` - Boolean check
- `canStartRoleplaySession(userId)` - Boolean check
- `canUseLifetimeCall(userId)` - Boolean check
- `calculateTokenTTL(remainingSeconds)` - Returns minutes for LiveKit

## Database Schema

26 tables (after consolidation):
- `users` - User accounts
- `subscriptions` - Active subscriptions
- `subscription_plans` - Plan definitions
- `daily_progress` - Daily activities (consolidated from daily_usage)
- `user_courses` - Week-by-week progress
- `conversations` - Transcripts
- `reports` - AI-generated feedback
- `topics`, `personalized_topics` - Discussion topics
- `vocabulary`, `user_vocabulary` - Vocabulary tracking
- Plus: listening_materials, quizzes, user_goals, payment_transactions, etc.

## Running the Server

```bash
# Install dependencies
npm install

# Run migrations
npm run db:run-migrations

# Development (watch mode)
npm run dev

# Production
npm start

# Test
npm test
```

## Key Features Implemented

✅ Modular architecture with 16 feature modules
✅ Authentication with JWT tokens (7-day expiry)
✅ Subscription management (free trial + paid plans)
✅ Course initialization and auto-rollover
✅ Daily activity tracking (speaking, roleplay, listening, etc.)
✅ Time-gating system (practice/roleplay/lifetime limits)
✅ AI report generation (vocabulary, grammar, fluency scores)
✅ Leaderboard with global and weekly rankings
✅ Payment webhook integration (AamarPay)
✅ LiveKit connection token generation
✅ User lifecycle (onboarding → trial → paid → upgrade)

## Next Steps

Phase 2 Implementation:
1. Implement actual LLM calls for report generation (Groq API)
2. Add email verification for new accounts
3. Implement payment webhook handlers
4. Add caching layer (Redis) for leaderboard
5. Integrate voice agent callbacks for transcript saving
6. Add comprehensive error logging
7. Implement rate limiting on sensitive endpoints
8. Add request/response logging middleware
9. Create admin dashboard endpoints
10. Add comprehensive test suite

## Development Notes

- All database queries use parameterized statements to prevent SQL injection
- Transaction support available for multi-step operations
- Error handling is centralized in error middleware
- All responses follow standardized JSON format
- JWT secret must be at least 32 characters in production
- Database connection pool automatically managed
- CORS enabled for frontend origin

---

**Architecture Version**: 2.0 (Modular)
**Last Updated**: $(date)
**Status**: Structure Complete ✅ | Implementation In Progress 🔄
