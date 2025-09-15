# Talktivity API Testing Guide

This guide provides instructions for testing the Talktivity API endpoints and verifying that all functionality works correctly.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Starting the Server](#starting-the-server)
3. [API Endpoints](#api-endpoints)
4. [Testing with Postman](#testing-with-postman)
5. [Testing with Scripts](#testing-with-scripts)
6. [Key Features Verification](#key-features-verification)

## Prerequisites

Before testing, ensure you have:
- Node.js installed
- PostgreSQL database running
- Environment variables configured in a `.env` file
- All dependencies installed (`npm install`)

## Starting the Server

To start the server for testing:

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on port 8082 by default.

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh-token` - Refresh authentication token
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/change-password` - Change password

### Topics
- `GET /api/topics` - Get all topics
- `GET /api/topics/:category_name` - Get topics by category
- `POST /api/topics/generate-roleplay` - Generate roleplay scenario

### Listening
- `GET /api/listening/topics` - Get listening topics
- `GET /api/listening/course/status` - Get course status
- `POST /api/listening/course/initialize` - Initialize personalized course

### Reports
- `GET /api/reports/:userId/:date` - Get daily report
- `POST /api/reports/generate` - Generate report
- `POST /api/reports/generate-with-attempts` - Generate report with retry logic

### Quiz
- `POST /api/quiz/generate-quiz-with-attempts` - Generate quiz with retry logic
- `POST /api/quiz/generate-listening-quiz-with-attempts` - Generate listening quiz with retry logic

### Transcripts
- `POST /api/transcripts` - Store conversation transcript
- `GET /api/transcripts/users/:userId/latest-conversations` - Get latest conversations
- `GET /api/transcripts/users/:userId/experience` - Check user experience level

### Leaderboard
- `GET /api/leaderboard/weekly` - Get weekly leaderboard
- `GET /api/leaderboard/overall` - Get overall leaderboard
- `GET /api/leaderboard/my-position` - Get current user's position

### Vocabulary
- `GET /api/vocabulary` - Get vocabulary data

### Groups
- `GET /api/groups` - Get all groups
- `POST /api/groups/create` - Create a new group
- `POST /api/groups/:groupId/join` - Join a group
- `POST /api/groups/:groupId/leave` - Leave a group
- `GET /api/groups/:groupId/members` - Get group members
- `GET /api/groups/joined` - Get groups user has joined
- `DELETE /api/groups/:groupId` - Delete a group

### Direct Messaging
- `POST /api/dm/send` - Send direct message
- `GET /api/dm/conversations` - Get DM conversations
- `GET /api/dm/messages/:conversationId` - Get messages in a conversation

## Testing with Postman

1. Import the `Talktivity_API.postman_collection.json` file into Postman
2. Set the `base_url` variable to your server URL (e.g., `http://localhost:8082`)
3. For authenticated endpoints:
   - First use the "Register" or "Login" endpoint
   - Copy the `token` from the response
   - Set the `auth_token` variable in Postman
   - For endpoints that return a `refreshToken`, set the `refresh_token` variable

## Testing with Scripts

### Automated Route Testing

Run the basic route test script:

```bash
node src/test-routes.js
```

### Comprehensive Testing

Run the comprehensive test script that includes personalized course generation:

```bash
node src/comprehensive-test.js
```

## Key Features Verification

### 1. Personalized Course Generation

The personalized course generation feature has been implemented in the listening module. To test:

1. Register and login a user
2. (Optional) Complete onboarding to provide user preferences
3. Call `POST /api/listening/course/initialize` to generate a personalized course
4. Verify that the response includes personalized topics based on user data

The implementation now:
- Uses user onboarding data to create relevant topics
- Generates 84 topics for a 12-week course
- Creates topics based on user interests, industry, and goals
- Provides fallback topics if generation fails

### 2. AI Integration

All AI functionality is properly integrated:
- Roleplay generation in the topics module
- Report generation in the reports module
- Quiz generation in the quiz module
- Listening quiz generation in the quiz module

### 3. Modular Architecture

The application follows a proper MVC modular structure:
- Each feature has its own module directory
- Clear separation of concerns (routes, controllers, services, repositories)
- Shared core components (database, authentication, error handling)
- Proper dependency injection

### 4. Error Handling

All modules include proper error handling:
- Validation of input parameters
- Graceful handling of database errors
- Meaningful error messages for clients
- Proper HTTP status codes

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check PostgreSQL is running
   - Verify database credentials in `.env` file
   - Ensure the database exists

2. **Authentication Errors**
   - Ensure you're using a valid JWT token
   - Check that the token hasn't expired
   - Verify the Authorization header format: `Bearer <token>`

3. **Environment Variables Missing**
   - Ensure all required variables are set in `.env`
   - Check the server logs for specific missing variables

### Testing Checklist

Before deploying to production, verify:

- [ ] All routes return expected responses
- [ ] Authentication works correctly
- [ ] Personalized course generation creates relevant topics
- [ ] AI integration functions properly
- [ ] Database operations work correctly
- [ ] Error handling provides meaningful feedback
- [ ] Rate limiting is functioning
- [ ] Security headers are applied

## Support

For issues with the API or testing, check the server logs for detailed error messages and consult the development team.