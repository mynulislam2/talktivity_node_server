// routes/google-auth.js
const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const router = express.Router();
const axios = require('axios'); // Added axios for token exchange

// Validate JWT_SECRET environment variable
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set. Please set JWT_SECRET in your environment variables.');
}

// Validate JWT_SECRET strength and security
const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long for security. Current length: ' + jwtSecret.length);
}

// Check if JWT_SECRET is not a common weak value
const weakSecrets = [
  'your-default-secret-key',
  'secret',
  'password',
  '123456',
  'admin',
  'test',
  'dev',
  'development',
  'production',
  'jwt-secret',
  'my-secret',
  'default-secret'
];

if (weakSecrets.includes(jwtSecret.toLowerCase())) {
  throw new Error('JWT_SECRET cannot be a common weak value. Please use a strong, randomly generated secret.');
}

// Check if JWT_SECRET contains only basic characters (indicates it might be weak)
if (/^[a-zA-Z0-9]+$/.test(jwtSecret) && jwtSecret.length < 64) {
  console.warn('⚠️  Warning: JWT_SECRET appears to be weak. Consider using a longer, more complex secret for production.');
}

console.log('✅ JWT_SECRET validation passed - using secure secret');

// Initialize Google OAuth client
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'postmessage' // Use 'postmessage' for web flow
);

// NEW: Google authentication using access token (simplified)
router.post('/google-token', async (req, res) => {
  let client;
  try {
    const { idToken, userInfo } = req.body;

    if (!idToken || !userInfo) {
      return res.status(400).json({
        success: false,
        error: 'Google access token and user info are required'
      });
    }

    const { email, name, picture, id: googleId } = userInfo;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email not found in Google token'
      });
    }

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

      // Ensure email is verified for Google users
      if (!user.is_email_verified) {
        await client.query(
          'UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE id = $2',
          [user.id]
        );
        user.is_email_verified = true;
      }
      if (!user.is_email_verified) {
        await client.query(
          'UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE id = $2',
          [user.id]
        );
        user.is_email_verified = true;
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { userId: user.id, email: user.email, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '7d' }
      );

      // Calculate expiry time in seconds
      const expiresIn = process.env.JWT_EXPIRE === '24h' ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

      res.json({
        success: true,
        message: 'Login successful (existing user)',
        data: {
          accessToken: token,
          refreshToken: refreshToken,
          expiresIn: expiresIn,
          token: token, // Keep for backward compatibility
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            profile_picture: user.profile_picture
          }
        }
      });
    } else {
      // Google user registration - always is_admin = false, is_email_verified = true
      const isAdmin = false; // Google users are never admin
      
      // Create new user
      const newUser = await client.query(
        `INSERT INTO users (email, full_name, google_id, profile_picture, password, is_admin, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, full_name, google_id, profile_picture, created_at, is_admin, is_email_verified`,
        [email, name, googleId, picture, '', isAdmin, true] // Google users: is_admin=false, is_email_verified=true
      );

      const createdUser = newUser.rows[0];

      // Auto-add user to the common group
      try {
        // Find the common group
        const groupRes = await client.query('SELECT id FROM groups WHERE is_common = TRUE LIMIT 1');
        if (groupRes.rows.length > 0) {
          const commonGroupId = groupRes.rows[0].id;
          await client.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [commonGroupId, createdUser.id]
          );
        } else {
          console.error('No common group found to auto-add user');
        }
      } catch (err) {
        console.error('Error adding user to common group:', err);
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: createdUser.id, email: createdUser.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { userId: createdUser.id, email: createdUser.email, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '7d' }
      );

      // Calculate expiry time in seconds
      const expiresIn = process.env.JWT_EXPIRE === '24h' ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          accessToken: token,
          refreshToken: refreshToken,
          expiresIn: expiresIn,
          token: token, // Keep for backward compatibility
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
    console.error('Google token auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  } finally {
    if (client) client.release();
  }
});

// NEW: Auto-verify all existing users' emails
router.post('/auto-verify-emails', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    
    // Update all users to have verified emails
    const result = await client.query(
      'UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE is_email_verified = FALSE RETURNING id, email'
    );

    res.json({
      success: true,
      message: `Successfully verified ${result.rows.length} user emails`,
      data: {
        verifiedCount: result.rows.length,
        users: result.rows
      }
    });

  } catch (error) {
    console.error('Auto-verify emails error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-verify emails'
    });
  } finally {
    if (client) client.release();
  }
});

// NEW: Google authentication using ID token (simplified)
router.post('/google-token', async (req, res) => {
  let client;
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'Google ID token is required'
      });
    }

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email not found in Google token'
      });
    }

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

      // Ensure email is verified for Google users
      if (!user.is_email_verified) {
        await client.query(
          'UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE id = $2',
          [user.id]
        );
        user.is_email_verified = true;
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { userId: user.id, email: user.email, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '7d' }
      );

      // Calculate expiry time in seconds
      const expiresIn = process.env.JWT_EXPIRE === '24h' ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

      res.json({
        success: true,
        message: 'Login successful (existing user)',
        data: {
          accessToken: token,
          refreshToken: refreshToken,
          expiresIn: expiresIn,
          token: token, // Keep for backward compatibility
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            profile_picture: user.profile_picture
          }
        }
      });
    } else {
      // Google user registration - always is_admin = false, is_email_verified = true
      const isAdmin = false; // Google users are never admin
      
      // Create new user
      const newUser = await client.query(
        `INSERT INTO users (email, full_name, google_id, profile_picture, password, is_admin, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, full_name, google_id, profile_picture, created_at, is_admin, is_email_verified`,
        [email, name, googleId, picture, '', isAdmin, true] // Google users: is_admin=false, is_email_verified=true
      );

      const createdUser = newUser.rows[0];

      // Auto-add user to the common group
      try {
        // Find the common group
        const groupRes = await client.query('SELECT id FROM groups WHERE is_common = TRUE LIMIT 1');
        if (groupRes.rows.length > 0) {
          const commonGroupId = groupRes.rows[0].id;
          await client.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [commonGroupId, createdUser.id]
          );
        } else {
          console.error('No common group found to auto-add user');
        }
      } catch (err) {
        console.error('Error adding user to common group:', err);
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: createdUser.id, email: createdUser.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { userId: createdUser.id, email: createdUser.email, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '7d' }
      );

      // Calculate expiry time in seconds
      const expiresIn = process.env.JWT_EXPIRE === '24h' ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          accessToken: token,
          refreshToken: refreshToken,
          expiresIn: expiresIn,
          token: token, // Keep for backward compatibility
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
    console.error('Google token auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  } finally {
    if (client) client.release();
  }
});

// NEW: Auto-verify all existing users' emails
router.post('/auto-verify-emails', async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    
    // Update all users to have verified emails
    const result = await client.query(
      'UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE is_email_verified = FALSE RETURNING id, email'
    );

    res.json({
      success: true,
      message: `Successfully verified ${result.rows.length} user emails`,
      data: {
        verifiedCount: result.rows.length,
        users: result.rows
      }
    });

  } catch (error) {
    console.error('Auto-verify emails error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-verify emails'
    });
  } finally {
    if (client) client.release();
  }
});

// POST /google - Handle Google OAuth (keeping for backward compatibility)
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

      // Ensure email is verified for Google users
      if (!user.is_email_verified) {
        await client.query(
          'UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE id = $2',
          [user.id]
        );
        user.is_email_verified = true;
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { userId: user.id, email: user.email, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '7d' }
      );

      // Calculate expiry time in seconds
      const expiresIn = process.env.JWT_EXPIRE === '24h' ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

      res.json({
        success: true,
        message: 'Login successful (existing user)',
        data: {
          accessToken: token,
          refreshToken: refreshToken,
          expiresIn: expiresIn,
          token: token, // Keep for backward compatibility
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            profile_picture: user.profile_picture
          }
        }
      });
    } else {
      // Google user registration - always is_admin = false
      const isAdmin = false; // Google users are never admin
      
      // Create new user
      const newUser = await client.query(
        `INSERT INTO users (email, full_name, google_id, profile_picture, password, is_admin, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, full_name, google_id, profile_picture, created_at, is_admin, is_email_verified`,
        [email, name, googleId, picture, '', isAdmin, true] // Google users: is_admin=false, is_email_verified=true
      );

      const createdUser = newUser.rows[0];

      // Auto-add user to the common group
      try {
        // Find the common group
        const groupRes = await client.query('SELECT id FROM groups WHERE is_common = TRUE LIMIT 1');
        if (groupRes.rows.length > 0) {
          const commonGroupId = groupRes.rows[0].id;
          await client.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [commonGroupId, createdUser.id]
          );
        } else {
          console.error('No common group found to auto-add user');
        }
      } catch (err) {
        console.error('Error adding user to common group:', err);
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: createdUser.id, email: createdUser.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '24h' }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { userId: createdUser.id, email: createdUser.email, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '7d' }
      );

      // Calculate expiry time in seconds
      const expiresIn = process.env.JWT_EXPIRE === '24h' ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          accessToken: token,
          refreshToken: refreshToken,
          expiresIn: expiresIn,
          token: token, // Keep for backward compatibility
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