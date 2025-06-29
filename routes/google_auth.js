// routes/google-auth.js
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const router = express.Router();

// Initialize Google OAuth client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'postmessage' // Use 'postmessage' for web flow
);

// Google OAuth login route
router.post('/google', async (req, res) => {
  let dbClient;
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }

    console.log('Received Google auth code:', code.substring(0, 20) + '...');

    // Exchange authorization code for tokens
    const { tokens } = await client.getToken(code);
    console.log('Tokens received from Google');

    // Get user info from Google
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    console.log('Google user info:', { email, name, googleId });

    // Connect to database
    dbClient = await pool.connect();

    // Check if user exists in database
    let userQuery = await dbClient.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    let user;

    if (userQuery.rows.length > 0) {
      // User exists, update Google ID if not set
      user = userQuery.rows[0];
      
      if (!user.google_id) {
        await dbClient.query(
          'UPDATE users SET google_id = $1, profile_picture = $2, updated_at = NOW() WHERE id = $3',
          [googleId, picture, user.id]
        );
        user.google_id = googleId;
        user.profile_picture = picture;
      }
      
      console.log('Existing user logged in:', user.id);
    } else {
      // User doesn't exist, create new user
      const insertResult = await dbClient.query(
        `INSERT INTO users (email, full_name, google_id, profile_picture, password) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, email, full_name, google_id, profile_picture, created_at`,
        [email, name, googleId, picture, ''] // Empty password for Google users
      );
      
      user = insertResult.rows[0];
      console.log('New user created:', user.id);
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        authProvider: 'google'
      },
      process.env.JWT_SECRET || 'your-default-secret-key',
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    // Return success response
    res.json({
      success: true,
      message: 'Google authentication successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          profile_picture: user.profile_picture,
          google_id: user.google_id,
          authProvider: 'google'
        }
      }
    });

  } catch (error) {
    console.error('Google authentication error:', error);
    
    // Handle specific Google API errors
    if (error.code === 'invalid_grant') {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired authorization code'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Google authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (dbClient) dbClient.release();
  }
});

// Refresh Google access token (optional, for future use)
router.post('/google/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    
    res.json({
      success: true,
      data: {
        access_token: credentials.access_token,
        expires_in: credentials.expiry_date
      }
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
});

module.exports = router;