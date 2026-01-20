const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { authenticateToken } = require('./auth-routes');
const { generateReportWithGroq } = require('./daily-reports');
const axios = require('axios');

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

/**
 * GET /generate-report
 * Generate report directly from database using latest conversation
 * No Python API needed - queries DB and uses Groq API directly
 */
router.get('/generate-report', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log(`🔄 Generating report for user ${userId} from latest conversation`);

    // Fetch latest conversation from database (full conversation, no date filter)
    const conversationsResult = await pool.query(`
      SELECT id, room_name, user_id, timestamp, transcript 
      FROM conversations 
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `, [userId]);

    const conversations = conversationsResult.rows;

    if (!conversations || conversations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No conversations found. Please complete a speaking session first.'
      });
    }

    // Parse transcript items from the latest conversation
    const transcriptItems = conversations
      .map((item) => {
        try {
          const parsed = JSON.parse(item.transcript);
          return parsed.items || [];
        } catch (error) {
          console.error("Error parsing transcript item:", error);
          return [];
        }
      })
      .flat()
      .filter((item) => item.role === 'user' && item.content);

    if (!transcriptItems || transcriptItems.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid transcript items found. Please complete a speaking session first.'
      });
    }

    console.log(`Found ${transcriptItems.length} transcript items for user ${userId}. Generating report...`);

    // Generate report using Groq API
    const groqResponse = await generateReportWithGroq(transcriptItems);

    if (!groqResponse.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate report',
        error: groqResponse.error
      });
    }

    console.log(`✅ Report generated for user ${userId}`);

    res.json({
      success: true,
      data: groqResponse.data
    });

  } catch (error) {
    console.error('❌ Error generating report:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to generate report at this time. Please try again later.'
    });
  }
});

module.exports = router;