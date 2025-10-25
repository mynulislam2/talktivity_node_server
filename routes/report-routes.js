// routes/report-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { authenticateToken } = require('./auth-routes');

// POST /api/report/completed - Mark report as completed for the authenticated user
router.post('/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Update the user's report completion status
    const result = await pool.query(
      'UPDATE users SET report_completed = true, updated_at = NOW() WHERE id = $1 RETURNING id, report_completed',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        reportCompleted: result.rows[0].report_completed
      }
    });

  } catch (error) {
    console.error('Error updating report completion status:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to update report completion status. Please try again later.'
    });
  }
});

// GET /api/report/completed - Check if the authenticated user has completed the report
router.get('/completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get the user's report completion status
    const result = await pool.query(
      'SELECT report_completed FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        reportCompleted: result.rows[0].report_completed || false
      }
    });

  } catch (error) {
    console.error('Error checking report completion status:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to check report completion status. Please try again later.'
    });
  }
});

module.exports = router;