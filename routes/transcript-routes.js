// routes/transcript-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db/index'); // Import pool from db module instead of server.js
const { authenticateToken } = require('./auth-routes');

// GET latest conversations for a specific user
router.get('/users/:userId/latest-conversations', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    // Validate userId
    if (isNaN(parseInt(userId))) {
      return res.status(400).json({
        success: false,
        error: 'User ID must be a number'
      });
    }

    // Get all conversations for the user
    const conversationsResult = await pool.query(`
      SELECT id, room_name, user_id, timestamp, transcript 
      FROM conversations 
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    // Count total conversations
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM conversations
      WHERE user_id = $1
    `, [userId]);

    const total = parseInt(countResult.rows[0].total);

    // Calculate pagination info
    const paginationInfo = {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: total > (parseInt(offset) + parseInt(limit))
    };

    res.json({
      success: true,
      data: {
        conversations: conversationsResult.rows,
        pagination: paginationInfo
      }
    });
  } catch (error) {
    console.error('Error fetching latest conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve conversations at this time. Please try again later.'
    });
  }
});

// GET all conversations for a user in a specific month and year
router.get('/users/:userId/conversations-by-month', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    if (isNaN(parseInt(userId))) {
      return res.status(400).json({
        success: false,
        error: 'User ID must be a number'
      });
    }
    if (!month || !year) {
      return res.status(400).json({
        success: false,
        error: 'Month and year are required as query parameters'
      });
    }
    const monthInt = parseInt(month);
    const yearInt = parseInt(year);
    if (isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month or year'
      });
    }

    // Query for conversations in the given month and year
    const conversationsResult = await pool.query(`
      SELECT id, room_name, user_id, timestamp, transcript
      FROM conversations
      WHERE user_id = $1
        AND EXTRACT(MONTH FROM timestamp) = $2
        AND EXTRACT(YEAR FROM timestamp) = $3
      ORDER BY timestamp DESC
    `, [userId, monthInt, yearInt]);

    res.json({
      success: true,
      data: {
        conversations: conversationsResult.rows,
        month: monthInt,
        year: yearInt
      }
    });
  } catch (error) {
    console.error('Error fetching conversations by month:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve conversations at this time. Please try again later.'
    });
  }
});

// GET /api/conversations/user/:userId - Check if user has conversation experience
router.get('/conversations/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (isNaN(parseInt(userId))) {
      return res.status(400).json({
        success: false,
        error: 'User ID must be a number'
      });
    }

    // Check if user has any conversations
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM conversations 
      WHERE user_id = $1
    `, [userId]);

    const hasConversations = parseInt(result.rows[0].count) > 0;

    res.json({
      success: true,
      data: {
        hasConversationExperience: hasConversations,
        conversationCount: parseInt(result.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Error checking conversation experience:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to check conversation experience at this time. Please try again later.'
    });
  }
});

// POST /api/conversations - Store conversation transcript
router.post('/conversations', authenticateToken, async (req, res) => {
  let client;
  try {
    const { user_id, transcript, room_name, session_duration, agent_state } = req.body;

    if (!user_id || !transcript) {
      return res.status(400).json({
        success: false,
        error: 'user_id and transcript are required'
      });
    }

    client = await pool.connect();

    const result = await client.query(`
      INSERT INTO conversations (user_id, transcript, room_name, session_duration, agent_state, timestamp)
      VALUES ($1, $2, $3, $4, $5, (NOW() AT TIME ZONE 'UTC'))
      RETURNING *
    `, [user_id, transcript, room_name || null, session_duration || null, agent_state || null]);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error storing conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to store conversation at this time. Please try again later.'
    });
  } finally {
    if (client) client.release();
  }
});

// GET /api/users/:user_id/latest-conversations - Get latest conversations for a user
router.get('/users/:user_id/latest-conversations', authenticateToken, async (req, res) => {
  let client;
  try {
    const { user_id } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    const isToday = req.query.isToday === 'true';

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    client = await pool.connect();

    let query;
    let params;

    if (isToday) {
      // Use UTC date range for "today" to match usage record dates
      const todayDate = new Date().toISOString().split('T')[0];
      const startTime = new Date(`${todayDate}T00:00:00Z`);
      const endTime = new Date(`${todayDate}T23:59:59.999Z`);

      query = `
        SELECT * FROM conversations 
        WHERE user_id = $1 AND timestamp >= $3 AND timestamp <= $4
        ORDER BY timestamp DESC 
        LIMIT $2
      `;
      params = [user_id, limit, startTime, endTime];
    } else {
      // Original behavior - exactly the same as before
      query = `
        SELECT * FROM conversations 
        WHERE user_id = $1 
        ORDER BY timestamp DESC 
        LIMIT $2
      `;
      params = [user_id, limit];
    }

    const result = await client.query(query, params);

    res.json({
      success: true,
      data: {
        conversations: result.rows
      }
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve conversations at this time. Please try again later.'
    });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;