// routes/transcript-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db/index'); // Import pool from db module instead of server.js
const { authenticateToken } = require('./auth-routes');


router.get('/devices/:deviceId/latest-conversations', async (req, res) => {
  console.log('Fetching device conversations...');
  try {
    const { deviceId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    console.log('Fetching conversations for:', { deviceId, limit, offset });

    // Validate deviceId (should be a string, not requiring numeric validation)
    if (!deviceId || deviceId.trim() === '') {
      console.log('Invalid deviceId:', deviceId);
      return res.status(400).json({
        success: false,
        error: 'Device ID is required and cannot be empty'
      });
    }

    console.log('Executing device conversations query...');
    // Get all conversations for the device
    const conversationsResult = await pool.query(`
      SELECT id, room_name, device_id, timestamp, transcript 
      FROM device_conversations 
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `, [deviceId, limit, offset]);
        
    console.log('Device conversations query result:', {
      rowCount: conversationsResult.rowCount,
      firstRow: conversationsResult.rows[0] ? 'exists' : 'null'
    });

    console.log('Executing device count query...');
    // Count total conversations for this device
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM device_conversations
      WHERE device_id = $1
    `, [deviceId]);
        
    const total = parseInt(countResult.rows[0].total);
    console.log('Total device conversations found:', total);

    // Calculate pagination info
    const paginationInfo = {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: total > (parseInt(offset) + parseInt(limit))
    };
    console.log('Pagination info:', paginationInfo);

    res.json({
      success: true,
      data: {
        conversations: conversationsResult.rows,
        pagination: paginationInfo
      }
    });
    console.log('Device conversations response sent successfully');
   
  } catch (error) {
    console.error('Error fetching device conversations:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      deviceId: req.params.deviceId
    });
        
    // Log database connection status
    try {
      const connectionTest = await pool.query('SELECT 1');
      console.log('Database connection status:', {
        connected: connectionTest.rows.length > 0,
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount
      });
    } catch (dbError) {
      console.error('Database connection test failed:', dbError.message);
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET transcript by ID with all latest conversations (no limit)
// Get latest conversations for a specific user
router.get('/users/:userId/latest-conversations', async (req, res) => {
  console.log('yes')
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    console.log('Fetching conversations for:', { userId, limit, offset });

    // Validate userId
    if (isNaN(parseInt(userId))) {
      console.log('Invalid userId format:', userId);
      return res.status(400).json({
        success: false,
        error: 'User ID must be a number'
      });
    }

    console.log('Executing conversations query...');
    // Get all conversations for the user
    const conversationsResult = await pool.query(`
      SELECT id, room_name, user_id, timestamp, transcript 
      FROM conversations 
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    console.log('Conversations query result:', {
      rowCount: conversationsResult.rowCount,
      firstRow: conversationsResult.rows[0] ? 'exists' : 'null'
    });

    console.log('Executing count query...');
    // Count total conversations
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM conversations
      WHERE user_id = $1
    `, [userId]);
    
    const total = parseInt(countResult.rows[0].total);
    console.log('Total conversations found:', total);

    // Calculate pagination info
    const paginationInfo = {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: total > (parseInt(offset) + parseInt(limit))
    };
    console.log('Pagination info:', paginationInfo);

    res.json({
      success: true,
      data: {
        conversations: conversationsResult.rows,
        pagination: paginationInfo
      }
    });
    console.log('Response sent successfully');

  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code, // PostgreSQL error code if applicable
      userId: req.params.userId
    });
    
    // Log database connection status
    try {
      const connectionTest = await pool.query('SELECT 1');
      console.log('Database connection status:', {
        connected: connectionTest.rows.length > 0,
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount
      });
    } catch (dbError) {
      console.error('Database connection test failed:', dbError.message);
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add debugging middleware for all routes
router.use((req, res, next) => {
  console.log('------------------');
  console.log('New Request:', {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    params: req.params,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      authorization: req.headers.authorization ? 'present' : 'absent'
    }
  });
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
    console.error('Error fetching latest transcript:', error);
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
    console.error(`Error fetching latest transcript for room ${req.params.room_name}:`, error);
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
    console.error('Error fetching all transcripts:', error);
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
    console.error(`Error fetching transcript with ID ${req.params.id}:`, error);
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
    console.error(`Error fetching transcripts for room ${req.params.room_name}:`, error);
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
    console.error('Error saving transcript:', error);
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
    console.error(`Error deleting transcript with ID ${req.params.id}:`, error);
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
    console.error('Error deleting all transcripts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
module.exports = router;