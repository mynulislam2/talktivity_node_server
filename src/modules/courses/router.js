/**
 * Courses Module Router
 * POST /api/courses/initialize
 * GET /api/courses/get-active
 * POST /api/courses/check-and-create-next-batch
 * GET /api/courses/progress
 * GET /api/courses/analytics
 * GET /api/courses/achievements
 * GET /api/courses/timeline
 * GET /api/courses/today-topic
 * GET /api/courses/weekly-progress
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const coursesController = require('./controller');

// Protected: Initialize course (first-time onboarding)
router.post('/initialize', authenticateToken, coursesController.initializeUserCourse);

// Protected: Get active course (simplified, no batch trigger)
router.get('/get-active', authenticateToken, coursesController.getCourseStatus);

// Protected: Check and create next batch
router.post('/check-and-create-next-batch', authenticateToken, coursesController.checkAndCreateNextBatch);

// Protected: Get full course timeline (12 weeks) with per-day progress merged
router.get('/timeline', authenticateToken, coursesController.getCourseTimeline);

module.exports = router;
