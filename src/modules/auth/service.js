// src/modules/auth/service.js
// Authentication business logic

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const { 
  createUser, 
  findUserByEmail, 
  updateUserProfile, 
  updateUserPassword,
  findOrCreateGoogleUser
} = require('./repo');
const { config } = require('../../config');
const { pool } = require('../../core/db/client');

const registerUser = async (email, password, fullName) => {
  // Check if user already exists
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new Error('User with this email already exists');
  }
  
  // Create user
  const user = await createUser(email, password, fullName);
  
  // Auto-add user to the common group
  // This would be implemented in the groups module
  
  // Generate JWT token for the newly registered user
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expire }
  );
  
  // Generate refresh token
  const refreshToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      type: 'refresh',
    },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshTokenExpire }
  );
  
  // Calculate expiry time in seconds
  const expiresIn = config.jwt.expire === '24h' ? 24 * 60 * 60 : 86400;
  
  return {
    accessToken: token,
    refreshToken: refreshToken,
    expiresIn: expiresIn,
    token: token, // Keep for backward compatibility
    user: user,
  };
};

const loginUser = async (email, password) => {
  // Find user by email
  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  // Ensure that user.password is a hashed value and not undefined
  if (!user.password) {
    throw new Error('Invalid credentials (password not found)');
  }
  
  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    throw new Error('Invalid credentials');
  }
  
  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expire }
  );
  
  // Generate refresh token
  const refreshToken = jwt.sign(
    { userId: user.id, email: user.email, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshTokenExpire }
  );
  
  // Calculate expiry time in seconds
  const expiresIn = config.jwt.expire === '24h' ? 24 * 60 * 60 : 86400;
  
  return {
    accessToken: token,
    refreshToken: refreshToken,
    expiresIn: expiresIn,
    token: token, // Keep for backward compatibility
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    },
  };
};

const refreshUserToken = async (refreshToken) => {
  // Verify refresh token
  const decoded = jwt.verify(refreshToken, config.jwt.secret);
  
  // Check if it's a refresh token
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  
  // Check if user exists in database
  const user = await findUserByEmail(decoded.email);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Check if email is verified
  if (!user.is_email_verified) {
    throw new Error('Email not verified');
  }
  
  // Generate new access token
  const newAccessToken = jwt.sign(
    { userId: decoded.userId, email: decoded.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expire }
  );
  
  // Generate new refresh token
  const newRefreshToken = jwt.sign(
    { userId: decoded.userId, email: decoded.email, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshTokenExpire }
  );
  
  // Calculate expiry time in seconds
  const expiresIn = config.jwt.expire === '24h' ? 24 * 60 * 60 : 86400;
  
  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: expiresIn,
  };
};

const getUserProfile = async (userId) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, email, full_name, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    return result.rows[0];
  } finally {
    client.release();
  }
};

const updateProfile = async (userId, fullName) => {
  if (!fullName) {
    throw new Error('Full name is required');
  }
  
  return await updateUserProfile(userId, fullName);
};

const changePassword = async (userId, currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) {
    throw new Error('Current password and new password are required');
  }
  
  // Get user with password
  const user = await findUserByEmailById(userId);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    throw new Error('Current password is incorrect');
  }
  
  // Update password
  await updateUserPassword(userId, newPassword);
};

// Helper function to find user by ID
const findUserByEmailById = async (userId) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, email, password FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  } finally {
    client.release();
  }
};

// Google authentication using access token
const googleTokenAuth = async (idToken, userInfo) => {
  // Validate required data
  if (!idToken || !userInfo) {
    throw new Error('Google access token and user info are required');
  }

  const { email, name, picture, id: googleId } = userInfo;

  if (!email) {
    throw new Error('Email not found in Google token');
  }

  // Find or create Google user
  const user = await findOrCreateGoogleUser(email, name, googleId, picture);

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expire }
  );

  // Generate refresh token
  const refreshToken = jwt.sign(
    { userId: user.id, email: user.email, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshTokenExpire }
  );

  // Calculate expiry time in seconds
  const expiresIn = config.jwt.expire === '24h' ? 24 * 60 * 60 : 86400;

  return {
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
  };
};

// Google authentication using ID token
const googleIdTokenAuth = async (idToken) => {
  if (!idToken) {
    throw new Error('Google ID token is required');
  }

  // Initialize Google OAuth client
  const client = new OAuth2Client(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri || 'postmessage'
  );

  // Verify the Google ID token
  const ticket = await client.verifyIdToken({
    idToken: idToken,
    audience: config.google.clientId
  });

  const payload = ticket.getPayload();
  const { email, name, picture, sub: googleId } = payload;

  if (!email) {
    throw new Error('Email not found in Google token');
  }

  // Find or create Google user
  const user = await findOrCreateGoogleUser(email, name, googleId, picture);

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expire }
  );

  // Generate refresh token
  const refreshToken = jwt.sign(
    { userId: user.id, email: user.email, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshTokenExpire }
  );

  // Calculate expiry time in seconds
  const expiresIn = config.jwt.expire === '24h' ? 24 * 60 * 60 : 86400;

  return {
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
  };
};

// Traditional Google OAuth using authorization code
const googleOAuth = async (code) => {
  if (!code) {
    throw new Error('Authorization code is required');
  }

  // Validate required environment variables
  if (!config.google.clientId || !config.google.clientSecret || !config.google.redirectUri) {
    throw new Error('Google OAuth configuration error');
  }

  // Exchange authorization code for tokens
  const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: config.google.redirectUri,
    grant_type: 'authorization_code'
  });

  const { access_token } = tokenResponse.data;

  if (!access_token) {
    throw new Error('Failed to obtain access token from Google');
  }

  // Get user info from Google
  const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${access_token}`
    }
  });

  const { email, name, picture, id: googleId } = userInfoResponse.data;

  if (!email) {
    throw new Error('Email not found in Google user info');
  }

  // Find or create Google user
  const user = await findOrCreateGoogleUser(email, name, googleId, picture);

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expire }
  );

  // Generate refresh token
  const refreshToken = jwt.sign(
    { userId: user.id, email: user.email, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshTokenExpire }
  );

  // Calculate expiry time in seconds
  const expiresIn = config.jwt.expire === '24h' ? 24 * 60 * 60 : 86400;

  return {
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
  };
};

// Admin registration with token validation
const adminRegister = async (email, password, fullName, adminToken) => {
  // Validate required fields
  if (!email || !password || !fullName || !adminToken) {
    throw new Error('All fields are required');
  }

  // Validate admin token
  const expectedAdminToken = config.admin.setupToken;
  if (!expectedAdminToken) {
    throw new Error('Admin setup not configured');
  }

  if (adminToken !== expectedAdminToken) {
    throw new Error('Invalid admin setup token');
  }

  // Check if admin already exists
  const client = await pool.connect();
  try {
    const existingAdmin = await client.query(
      'SELECT id FROM users WHERE is_admin = true LIMIT 1'
    );

    if (existingAdmin.rows.length > 0) {
      throw new Error('Admin account already exists');
    }

    // Check if email already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const saltRounds = config.security.saltRounds;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create admin user
    const result = await client.query(
      'INSERT INTO users (email, password, full_name, is_admin, is_email_verified) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, created_at',
      [email, hashedPassword, fullName, true, true] // Admin users are automatically email verified
    );

    if (!result?.rows?.[0]) {
      throw new Error('Admin user creation failed');
    }

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expire }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user.id, email: user.email, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: config.jwt.refreshTokenExpire }
    );

    // Calculate expiry time in seconds
    const expiresIn = config.jwt.expire === '24h' ? 24 * 60 * 60 : 86400;

    return {
      accessToken: token,
      refreshToken: refreshToken,
      expiresIn: expiresIn,
      token: token, // Keep for backward compatibility
      user: user,
    };
  } finally {
    client.release();
  }
};

// Validate admin setup token
const validateAdminToken = async (adminToken) => {
  if (!adminToken) {
    throw new Error('Admin token is required');
  }

  const expectedAdminToken = config.admin.setupToken;
  if (!expectedAdminToken) {
    throw new Error('Admin setup not configured');
  }

  const isValid = adminToken === expectedAdminToken;

  // Check if admin already exists
  const client = await pool.connect();
  try {
    const existingAdmin = await client.query(
      'SELECT id FROM users WHERE is_admin = true LIMIT 1'
    );

    if (existingAdmin.rows.length > 0) {
      throw new Error('Admin account already exists');
    }

    return {
      isValid,
    };
  } finally {
    client.release();
  }
};

module.exports = {
  registerUser,
  loginUser,
  refreshUserToken,
  getUserProfile,
  updateProfile,
  changePassword,
  googleTokenAuth,
  googleIdTokenAuth,
  googleOAuth,
  adminRegister,
  validateAdminToken
};