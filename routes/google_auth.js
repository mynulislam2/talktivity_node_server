// routes/google-auth.js
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const router = express.Router();
const axios = require('axios'); // Added axios for token exchange

// Initialize Google OAuth client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'postmessage' // Use 'postmessage' for web flow
);

// POST /google - Handle Google OAuth
router.post('/google', async (req, res) => {
  let client;
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const { access_token } = tokenResponse.data;

    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const { email, name, picture, id: googleId } = userInfoResponse.data;

    client = await pool.connect();

    // Check if user already exists
    let user = await client.query(
      'SELECT * FROM users WHERE email = $1 OR google_id = $2',
      [email, googleId]
    );

    if (user.rows.length > 0) {
      // User exists, update Google ID if needed
      user = user.rows[0];
      
      if (!user.google_id && googleId) {
        await client.query(
          'UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2',
          [googleId, user.id]
        );
        user.google_id = googleId;
      }

      // Update profile picture if provided and different
      if (picture && picture !== user.profile_picture) {
        await client.query(
          'UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE id = $2',
          [picture, user.id]
        );
        user.profile_picture = picture;
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET || 'your-default-secret-key',
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            profile_picture: user.profile_picture
          }
        }
      });
    } else {
      // Create new user
      const newUser = await client.query(
        `INSERT INTO users (email, full_name, google_id, profile_picture, password)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, full_name, google_id, profile_picture, created_at`,
        [email, name, googleId, picture, ''] // Empty password for Google users
      );

      const createdUser = newUser.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { userId: createdUser.id, email: createdUser.email },
        process.env.JWT_SECRET || 'your-default-secret-key',
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          token,
          user: {
            id: createdUser.id,
            email: createdUser.email,
            full_name: createdUser.full_name,
            profile_picture: createdUser.profile_picture
          }
        }
      });
    }

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  } finally {
    if (client) client.release();
  }
});

// Refresh Google access token (optional, for future use)
router.post('/refresh', async (req, res) => {
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