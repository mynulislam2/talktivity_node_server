// routes/report-routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { authenticateToken } = require('./auth-routes');
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
 * Proxy to Python API for report generation
 * Frontend calls Node.js, Node.js calls Python (no CORS issues)
 */
router.get('/generate-report', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const token = req.headers.authorization; // Get the JWT token from request
    
    // Python API URL (internal call, no CORS needed)
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8090';
    
    console.log(`Proxying report generation request to Python API for user ${userId}`);
    
    // Call Python API internally (server-to-server, no CORS)
    const pythonResponse = await axios.get(`${pythonApiUrl}/generate-report`, {
      headers: {
        'Authorization': token, // Forward the JWT token
      },
      timeout: 120000, // 2 minutes timeout for report generation
    });
    
    // Return Python API response directly
    return res.json(pythonResponse.data);
    
  } catch (error) {
    console.error('Error proxying to Python API:', error);
    
    // Handle axios errors
    if (error.response) {
      // Python API returned an error
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data?.error || 'Failed to generate report',
      });
    } else if (error.request) {
      // Python API is not reachable
      return res.status(503).json({
        success: false,
        error: 'Python API server is not available. Please try again later.',
      });
    } else {
      // Other error
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate report',
      });
    }
  }
});

module.exports = router;