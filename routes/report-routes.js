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
    
    // Python API URL - use environment variable or default
    // For production (Render), set PYTHON_API_URL=https://api.talktivity.app
    // For local dev, use http://localhost:8090
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8090';
    
    if (!pythonApiUrl || pythonApiUrl === 'undefined') {
      console.error('PYTHON_API_URL is not configured');
      return res.status(500).json({
        success: false,
        error: 'Python API server is not configured. Please contact support.',
      });
    }
    
    const fullUrl = `${pythonApiUrl}/generate-report`;
    console.log(`Proxying report generation request to Python API for user ${userId}`);
    console.log(`Python API URL: ${fullUrl}`);
    
    // Call Python API (server-to-server, no CORS needed)
    const startTime = Date.now();
    const pythonResponse = await axios.get(fullUrl, {
      headers: {
        'Authorization': token, // Forward the JWT token
      },
      timeout: 150000, // 150 seconds (2.5 minutes) - Python API waits up to 120 seconds for conversation to complete
      validateStatus: function (status) {
        return status < 500; // Don't throw for 4xx errors, let us handle them
      },
    });
    
    const duration = Date.now() - startTime;
    console.log(`Python API responded in ${duration}ms with status ${pythonResponse.status}`);
    
    // Check if Python API returned an error
    if (pythonResponse.status >= 400) {
      return res.status(pythonResponse.status).json({
        success: false,
        error: pythonResponse.data?.error || 'Failed to generate report',
      });
    }
    
    // Return Python API response directly
    return res.json(pythonResponse.data);
    
  } catch (error) {
    console.error('Error proxying to Python API:', error.message);
    
    // Handle axios errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      // Python API is not reachable
      return res.status(503).json({
        success: false,
        error: 'Python API server is not available. Please check PYTHON_API_URL configuration.',
      });
    } else if (error.response) {
      // Python API returned an error
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data?.error || 'Failed to generate report',
      });
    } else if (error.request) {
      // Request was made but no response received
      return res.status(503).json({
        success: false,
        error: 'Python API server did not respond. Please try again later.',
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