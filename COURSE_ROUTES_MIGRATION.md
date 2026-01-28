# Course Routes Conversion Plan

## File: routes/course-routes.js (3393 lines)

### Breakdown by Module

#### **Routes/Endpoints to Extract**
1. ✅ POST `/api/courses/initialize` → coursesService.initializeCourse()
2. GET `/api/courses/status` → coursesService.getCourseStatus()
3. POST `/api/courses/speaking/check-time` → DEPRECATED (kept for compatibility)
4. POST `/api/courses/user-speaking/start` → speakingService.startSession()
5. POST `/api/courses/user-speaking/end` → speakingService.endSession()
6. POST `/api/courses/user-speaking/check-time` → DEPRECATED
7. POST `/api/courses/user-speaking/status` → speakingService.getStatus()
8. POST `/api/courses/quiz/complete` → coursesService.completeQuiz()
9. POST `/api/courses/listening/start` → coursesService.startListeningSession()
10. POST `/api/courses/listening/complete` → coursesService.completeListening()
11. POST `/api/courses/listening-quiz/complete` → coursesService.completeListeningQuiz()
12. POST `/api/courses/exam/complete` → coursesService.completeExam()
13. GET `/api/courses/progress` → coursesService.getCourseProgress()
14. GET `/api/courses/speaking/sessions-by-month` → speakingService.getSessionsByMonth()
15. GET `/api/courses/results-by-month` → coursesService.getResultsByMonth()
16. GET `/api/reports/monthly` → reportsService.getMonthlyReport()
17. POST `/api/courses/generate-personalized` → coursesService.generatePersonalizedCourse()
18. GET `/api/courses/timeline` → coursesService.getCourseTimeline()
19. GET `/api/courses/today-topic` → coursesService.getTodayTopic()
20. GET `/api/courses/analytics` → coursesService.getAnalytics()
21. GET `/api/courses/achievements` → coursesService.getAchievements()
22. GET `/api/courses/weekly-progress` → coursesService.getWeeklyProgress()
23. POST `/api/courses/generate-next-batch` → coursesService.generateNextBatch()

#### **Helper Functions to Extract**
- generatePersonalizedCourse() → service method
- checkAndTriggerNextBatch() → service helper
- checkAndTriggerNextBatchByTime() → service helper
- getDayType() → service utility
- calculateTimeRemaining() → DEPRECATED, remove
- isSpeakingAvailable() → service utility
- isQuizAvailable() → service utility
- isListeningAvailable() → service utility
- isListeningQuizAvailable() → service utility

#### **Middleware/Utilities to Extract**
- authenticateToken → Move to `src/core/middleware/auth.js`
- JWT_SECRET validation → Move to `src/core/config/jwt.js`

---

## Migration Status

### Phase 1: Service Layer (IN PROGRESS)
- [x] Initialize header with imports and requires
- [ ] Complete service methods for all 23 endpoints
- [ ] Add helper/utility methods
- [ ] Add analytics calculations (XP, Level, Badges)

### Phase 2: Controller Layer (PENDING)
- [ ] Create HTTP handlers for all routes
- [ ] Request validation
- [ ] Error handling
- [ ] Response formatting

### Phase 3: Routes Layer (PENDING)
- [ ] Define all 23 routes with correct HTTP methods
- [ ] Mount middleware (authenticateToken)
- [ ] Error handling middleware

### Phase 4: Cleanup (PENDING)
- [ ] Update JWT middleware location
- [ ] Archive original `routes/course-routes.js`
- [ ] Verify all endpoints working
- [ ] Update API documentation

---

## Key Notes

1. **Large File**: 3393 lines → ~1500 lines service + ~1000 lines controller + ~300 lines routes
2. **Complex Business Logic**: Personalized course generation uses Groq AI
3. **Multiple Database Operations**: Each operation may need transaction handling
4. **Subscription Integration**: Uses subscription plans for time limits
5. **Analytics**: Requires XP/Level calculation utility

---

## Next Steps

1. Complete coursesService.js with all methods
2. Create coursesService.controller.js
3. Create coursesService.routes.js
4. Migrate middleware to core
5. Update app.js to mount new routes
6. Remove/archive legacy file
