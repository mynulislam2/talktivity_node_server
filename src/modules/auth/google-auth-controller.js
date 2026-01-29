const {
  validateJWTSecret,
  generateTokens,
  exchangeGoogleCode,
  verifyGoogleIdToken,
  createOrUpdateGoogleUser,
  verifyAllUserEmails,
  refreshAccessToken,
} = require('./google-auth-service');
const { ValidationError } = require('../../core/error/errors');

/**
 * POST /google - Handle Google OAuth code exchange
 */
async function handleGoogleOAuth(req, res) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required',
      });
    }

    console.log('✅ Google OAuth request received');

    // Exchange code for user info
    const { email, name, picture, googleId } = await exchangeGoogleCode(code);

    // Create or update user
    const { user, isNew } = await createOrUpdateGoogleUser(email, name, picture, googleId);

    // Generate tokens
    const { accessToken, refreshToken, expiresIn } = generateTokens(user.id, user.email);

    const statusCode = isNew ? 201 : 200;
    const message = isNew ? 'Account created successfully' : 'Login successful (existing user)';

    console.log(`✅ Google OAuth ${isNew ? 'registration' : 'login'} successful for user:`, user.id);

    res.status(statusCode).json({
      success: true,
      message,
      data: {
        accessToken,
        refreshToken,
        expiresIn,
        token: accessToken, // Backward compatibility
        isNew,              // Let frontend know this was a new registration
        user: {
          id: user.id,
          email: user.email,
          // Use camelCase to match frontend User type
          fullName: user.full_name,
          profilePicture: user.profile_picture,
        },
      },
    });
  } catch (error) {
    console.error('❌ Google OAuth error:', error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // Handle network errors
    if (error.message.includes('Unable to connect')) {
      return res.status(503).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Authentication failed. Please try again.',
    });
  }
}

/**
 * POST /google-token - Handle Google ID token authentication
 */
async function handleGoogleToken(req, res) {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'Google ID token is required',
      });
    }

    // Verify ID token
    const { email, name, picture, googleId } = await verifyGoogleIdToken(idToken);

    // Create or update user
    const { user, isNew } = await createOrUpdateGoogleUser(email, name, picture, googleId);

    // Generate tokens
    const { accessToken, refreshToken, expiresIn } = generateTokens(user.id, user.email);

    const statusCode = isNew ? 201 : 200;
    const message = isNew ? 'Account created successfully' : 'Login successful (existing user)';

    console.log(`✅ Google token ${isNew ? 'registration' : 'login'} successful for user:`, user.id);

    res.status(statusCode).json({
      success: true,
      message,
      data: {
        accessToken,
        refreshToken,
        expiresIn,
        token: accessToken, // Backward compatibility
        isNew,              // Surface registration vs existing login
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          profilePicture: user.profile_picture,
        },
      },
    });
  } catch (error) {
    console.error('❌ Google token auth error:', error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}

/**
 * POST /refresh - Refresh access token using refresh token
 */
async function handleTokenRefresh(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      });
    }

    const { accessToken, expiresIn } = await refreshAccessToken(refreshToken);

    res.json({
      success: true,
      data: {
        accessToken,
        expiresIn,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);

    if (error instanceof ValidationError) {
      return res.status(401).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
    });
  }
}

/**
 * POST /auto-verify-emails - Verify all unverified user emails
 */
async function handleAutoVerifyEmails(req, res) {
  try {
    const verifiedUsers = await verifyAllUserEmails();

    res.json({
      success: true,
      message: `Successfully verified ${verifiedUsers.length} user emails`,
      data: {
        verifiedCount: verifiedUsers.length,
        users: verifiedUsers,
      },
    });
  } catch (error) {
    console.error('❌ Auto-verify emails error:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to auto-verify emails',
    });
  }
}

module.exports = {
  handleGoogleOAuth,
  handleGoogleToken,
  handleTokenRefresh,
  handleAutoVerifyEmails,
};
