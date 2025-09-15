// src/modules/auth/service.js
// Authentication business logic

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { 
  createUser, 
  findUserByEmail, 
  updateUserProfile, 
  updateUserPassword 
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

module.exports = {
  registerUser,
  loginUser,
  refreshUserToken,
  getUserProfile,
  updateProfile,
  changePassword
};