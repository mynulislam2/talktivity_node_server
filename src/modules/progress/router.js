/**
 * Progress Module Router
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const progressController = require('./controller');

router.get('/daily', authenticateToken, progressController.getDailyProgress);
router.post('/daily', authenticateToken, progressController.upsertDailyProgress);
router.get('/overview', authenticateToken, progressController.getProgressOverview);
router.post('/weekly-exam/complete', authenticateToken, progressController.completeWeeklyExam);

module.exports = router;
