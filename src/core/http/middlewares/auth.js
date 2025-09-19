// src/core/http/middlewares/auth.js
// Authentication middleware

const jwt = require('jsonwebtoken');
const { pool } = require('../../db/client');
const { config } = require('../../../config');

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token required',
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Additional security checks
    if (!decoded.userId || !decoded.email) {
      return res.status(403).json({
        success: false,
        error: 'Invalid token payload',
      });
    }

    // Check if user exists in database (enhanced security)
    let client;
    try {
      client = await pool.connect();
      const { rows } = await client.query(
        'SELECT id, email, is_email_verified, is_admin FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'User not found',
        });
      }

      // Check if email is verified (enhanced security)
      if (!rows[0].is_email_verified) {
        return res.status(403).json({
          success: false,
          error: 'Email not verified',
        });
      }

      // Attach enhanced user info to request
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        isEmailVerified: rows[0].is_email_verified,
        isAdmin: rows[0].is_admin || false,
      };

      next();
    } catch (dbError) {
      console.error('Database error during authentication:', dbError);
      return res.status(503).json({
        success: false,
        error: 'Authentication service unavailable',
      });
    } finally {
      if (client) client.release();
    }
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}

// Middleware to check if user is admin
async function requireAdmin(req, res, next) {
  try {
    // First ensure user is authenticated
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    let client;
    try {
      client = await pool.connect();
      
      // Check if user has admin privileges
      const { rows } = await client.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [req.user.userId]
      );
      
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      if (!rows[0].is_admin) {
        return res.status(403).json({
          success: false,
          error: 'Admin privileges required'
        });
      }
      
      next();
    } finally {
      if (client) client.release();
    }
  } catch (error) {
    console.error('Error in admin authorization:', error);
    res.status(500).json({
      success: false,
      error: 'Authorization service unavailable'
    });
  }
}

module.exports = { authenticateToken, requireAdmin };