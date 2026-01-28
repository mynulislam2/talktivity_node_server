const jwt = require('jsonwebtoken');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const db = require('../../core/db/client');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

/**
 * Validate JWT_SECRET environment variable for security
 * Ensures secret meets minimum security standards
 * @throws {Error} If JWT_SECRET is invalid or weak
 */
function validateJWTSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET environment variable is required but not set. Please set JWT_SECRET in your environment variables.'
    );
  }

  const jwtSecret = process.env.JWT_SECRET;
  
  if (jwtSecret.length < 32) {
    throw new Error(
      `JWT_SECRET must be at least 32 characters long for security. Current length: ${jwtSecret.length}`
    );
  }

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
    'default-secret',
  ];

  if (weakSecrets.includes(jwtSecret.toLowerCase())) {
    throw new Error(
      'JWT_SECRET cannot be a common weak value. Please use a strong, randomly generated secret.'
    );
  }

  if (/^[a-zA-Z0-9]+$/.test(jwtSecret) && jwtSecret.length < 64) {
    console.warn('⚠️  Warning: JWT_SECRET appears to be weak. Consider using a longer, more complex secret for production.');
  }

  console.log('✅ JWT_SECRET validation passed - using secure secret');
}

/**
 * Initialize Google OAuth2Client
 * @returns {OAuth2Client} Initialized OAuth2Client instance
 */
function initializeGoogleClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'postmessage'
  );
}

/**
 * Generate JWT and refresh tokens for authenticated user
 * @param {number} userId - User ID
 * @param {string} email - User email
 * @returns {Object} Object with accessToken, refreshToken, and expiresIn
 */
function generateTokens(userId, email) {
  const accessToken = jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );

  const refreshToken = jwt.sign(
    { userId, email, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || '7d' }
  );

  // Calculate expiry time in seconds (default: 24 hours)
  const expiresIn = process.env.JWT_EXPIRE === '24h' ? 24 * 60 * 60 : 86400;

  return { accessToken, refreshToken, expiresIn };
}

/**
 * Exchange Google authorization code for tokens and user info
 * @param {string} code - Authorization code from Google
 * @returns {Promise<Object>} Object with email, name, picture, googleId
 */
async function exchangeGoogleCode(code) {
  if (!code) {
    throw new ValidationError('Authorization code is required');
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    throw new Error('Google OAuth configuration error - missing required environment variables');
  }

  console.log('✅ Exchanging authorization code for tokens...');

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const { access_token } = tokenResponse.data;

    if (!access_token) {
      throw new Error('No access token received from Google');
    }

    console.log('✅ Getting user info from Google...');

    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { email, name, picture, id: googleId } = userInfoResponse.data;

    if (!email) {
      throw new ValidationError('Email not found in Google user info');
    }

    return { email, name, picture, googleId };
  } catch (error) {
    if (error.response?.status === 400) {
      throw new ValidationError('Invalid authorization code. Please try logging in again.');
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('Unable to connect to Google services. Please try again later.');
    }
    throw error;
  }
}

/**
 * Verify Google ID token
 * @param {string} idToken - Google ID token
 * @returns {Promise<Object>} Payload containing email, name, picture, googleId
 */
async function verifyGoogleIdToken(idToken) {
  if (!idToken) {
    throw new ValidationError('Google ID token is required');
  }

  const client = initializeGoogleClient();

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      throw new ValidationError('Email not found in Google token');
    }

    return { email, name, picture, googleId };
  } catch (error) {
    throw new ValidationError('Failed to verify Google token');
  }
}

/**
 * Create or update Google user in database
 * @param {string} email - User email
 * @param {string} name - User full name
 * @param {string} picture - User profile picture URL
 * @param {string} googleId - Google user ID
 * @returns {Promise<Object>} User object
 */
async function createOrUpdateGoogleUser(email, name, picture, googleId) {
  if (!email) {
    throw new ValidationError('Email is required');
  }

  return await db.transaction(async (client) => {
    // Check if user already exists
    let userResult = await client.query(
      'SELECT * FROM users WHERE email = $1 OR google_id = $2',
      [email, googleId]
    );

    if (userResult.rows.length > 0) {
      console.log('✅ Existing user found, updating...');
      const user = userResult.rows[0];

      // Update Google ID if needed
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

      return { user, isNew: false };
    } else {
      console.log('✅ Creating new user...');
      // Google users are never admin and always have verified email
      const newUserResult = await client.query(
        `INSERT INTO users (email, full_name, google_id, profile_picture, password, is_admin, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, full_name, google_id, profile_picture, created_at, is_admin, is_email_verified`,
        [email, name, googleId, picture, '', false, true]
      );

      const createdUser = newUserResult.rows[0];

      // Auto-add user to the common group
      try {
        const groupRes = await client.query('SELECT id FROM groups WHERE is_common = TRUE LIMIT 1');
        if (groupRes.rows.length > 0) {
          const commonGroupId = groupRes.rows[0].id;
          await client.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [commonGroupId, createdUser.id]
          );
        } else {
          console.warn('⚠️  No common group found to auto-add user');
        }
      } catch (err) {
        console.error('❌ Error adding user to common group:', err);
      }

      return { user: createdUser, isNew: true };
    }
  });
}

/**
 * Verify all unverified user emails in the database
 * @returns {Promise<Array>} Array of verified user IDs and emails
 */
async function verifyAllUserEmails() {
  return await db.transaction(async (client) => {
    const result = await client.query(
      'UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE is_email_verified = FALSE RETURNING id, email'
    );

    return result.rows;
  });
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New access token and expiry
 */
async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  try {
    // Verify and decode the refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.type !== 'refresh') {
      throw new ValidationError('Invalid token type');
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    const expiresIn = process.env.JWT_EXPIRE === '24h' ? 24 * 60 * 60 : 86400;

    return { accessToken: newAccessToken, expiresIn };
  } catch (error) {
    throw new ValidationError('Failed to refresh token');
  }
}

module.exports = {
  validateJWTSecret,
  initializeGoogleClient,
  generateTokens,
  exchangeGoogleCode,
  verifyGoogleIdToken,
  createOrUpdateGoogleUser,
  verifyAllUserEmails,
  refreshAccessToken,
};
