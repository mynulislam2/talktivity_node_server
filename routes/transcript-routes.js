// routes/transcript-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db/index'); // Import pool from db module instead of server.js
const { authenticateToken } = require('./auth-routes');


router.get('/devices/:deviceId/latest-conversations', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    // Validate deviceId (should be a string, not requiring numeric validation)
    if (!deviceId || deviceId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Device ID is required and cannot be empty'
      });
    }

    // Get all conversations for the device
    const conversationsResult = await pool.query(`
      SELECT id, room_name, device_id, timestamp, transcript 
      FROM device_conversations 
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `, [deviceId, limit, offset]);
        
    // Count total conversations for this device
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM device_conversations
      WHERE device_id = $1
    `, [deviceId]);
        
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET transcript by ID with all latest conversations (no limit)
// Get latest conversations for a specific user
router.get('/users/:userId/latest-conversations', async (req, res) => {
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET all conversations for a user in a specific month and year
router.get('/users/:userId/conversations-by-month', async (req, res) => {
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add debugging middleware for all routes
router.use((req, res, next) => {
  next();
});
// GET latest transcript session
router.get('/latest-transcript', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, room_name, participant_identity, timestamp, transcript 
      FROM conversations 
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No transcripts found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET latest transcript for a specific room
router.get('/latest-transcript/:room_name', async (req, res) => {
  try {
    const { room_name } = req.params;
    
    const result = await pool.query(`
      SELECT id, room_name, participant_identity, timestamp, transcript 
      FROM conversations 
      WHERE room_name = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `, [room_name]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No transcripts found for room ${room_name}`
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET all transcripts
router.get('/transcripts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, room_name, participant_identity, timestamp, transcript 
      FROM conversations 
      ORDER BY timestamp DESC
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET transcript by ID
router.get('/transcripts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT id, room_name, participant_identity, timestamp, transcript 
      FROM conversations 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET transcripts by room name
router.get('/transcripts/room/:room_name', async (req, res) => {
  try {
    const { room_name } = req.params;
    
    const result = await pool.query(`
      SELECT id, room_name, participant_identity, timestamp, transcript 
      FROM conversations 
      WHERE room_name = $1
      ORDER BY timestamp DESC
    `, [room_name]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST new transcript
router.post('/transcripts', async (req, res) => {
  try {
    const { room_name, participant_identity, transcript } = req.body;
    
    if (!room_name || !transcript) {
      return res.status(400).json({
        success: false,
        error: 'Room name and transcript are required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO conversations (room_name, participant_identity, transcript)
      VALUES ($1, $2, $3)
      RETURNING id, room_name, participant_identity, timestamp, transcript
    `, [room_name, participant_identity, transcript]);
    
    res.status(201).json({
      success: true,
      message: 'Transcript saved successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE transcript by ID
router.delete('/transcripts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if transcript exists
    const checkResult = await pool.query(`
      SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1)
    `, [id]);
    
    if (!checkResult.rows[0].exists) {
      return res.status(404).json({
        success: false,
        error: 'Transcript not found'
      });
    }
    
    // Delete the transcript
    await pool.query(`
      DELETE FROM conversations WHERE id = $1
    `, [id]);
    
    res.json({
      success: true,
      message: 'Transcript deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.delete('/transcripts/all', async (req, res) => {
  try {
    // Delete all transcripts belonging to the authenticated user
    const result = await pool.query(`
      DELETE FROM conversations 
      WHERE user_id = $1
      RETURNING id
    `, [req.user.id]);
    
    const deletedCount = result.rowCount;
    
    if (deletedCount === 0) {
      return res.json({
        success: true,
        message: 'No transcripts found to delete',
        count: 0
      });
    }
    
    res.json({
      success: true,
      message: 'All transcripts deleted successfully',
      count: deletedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
module.exports = router;