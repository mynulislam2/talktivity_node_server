// src/modules/auth/controller.js
// Authentication request handlers

const { 
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
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// Register user
const register = async (req, res) => {
  try {
    const { email, password, full_name } = req.body;
    
    const result = await registerUser(email, password, full_name);
    
    res.status(201).json(successResponse(result, 'User registered successfully'));
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json(errorResponse(error, 'Registration failed. Please try again later.'));
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const result = await loginUser(email, password);
    
    res.json(successResponse(result, 'Login successful'));
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json(errorResponse(error, 'Invalid credentials'));
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json(errorResponse('Refresh token is required'));
    }
    
    const result = await refreshUserToken(refreshToken);
    
    res.json(successResponse(result, 'Token refreshed successfully'));
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json(errorResponse(error, 'Invalid or expired refresh token'));
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await getUserProfile(req.user.userId);
    res.json(successResponse(user));
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json(errorResponse(error, 'Failed to fetch user profile'));
  }
};

// Update user profile
const updateProfileHandler = async (req, res) => {
  try {
    const { full_name } = req.body;
    
    const user = await updateProfile(req.user.userId, full_name);
    
    res.json(successResponse(user, 'Profile updated successfully'));
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json(errorResponse(error, 'Failed to update profile'));
  }
};

// Change password
const changePasswordHandler = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    
    await changePassword(req.user.userId, current_password, new_password);
    
    res.json(successResponse(null, 'Password changed successfully'));
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json(errorResponse(error, 'Failed to change password'));
  }
};

// Google authentication using access token
const googleToken = async (req, res) => {
  try {
    const { idToken, userInfo } = req.body;

    const result = await googleTokenAuth(idToken, userInfo);
    
    res.json(successResponse(result, result.user.id ? 'Login successful (existing user)' : 'Account created successfully'));
  } catch (error) {
    console.error('Google token auth error:', error);
    res.status(500).json(errorResponse(error, 'Authentication failed'));
  }
};

// Google authentication using ID token
const googleIdToken = async (req, res) => {
  try {
    const { idToken } = req.body;

    const result = await googleIdTokenAuth(idToken);
    
    res.json(successResponse(result, result.user.id ? 'Login successful (existing user)' : 'Account created successfully'));
  } catch (error) {
    console.error('Google ID token auth error:', error);
    res.status(500).json(errorResponse(error, 'Authentication failed'));
  }
};

// Traditional Google OAuth using authorization code
const googleAuth = async (req, res) => {
  try {
    const { code } = req.body;

    const result = await googleOAuth(code);
    
    res.status(result.user.id ? 200 : 201).json(successResponse(result, result.user.id ? 'Login successful (existing user)' : 'Account created successfully'));
  } catch (error) {
    console.error('Google OAuth error:', error);
    
    if (error.message === 'Invalid authorization code. Please try logging in again.') {
      return res.status(400).json(errorResponse(error, 'Invalid authorization code. Please try logging in again.'));
    }
    
    if (error.message === 'Unable to connect to Google services. Please try again later.') {
      return res.status(503).json(errorResponse(error, 'Unable to connect to Google services. Please try again later.'));
    }
    
    res.status(500).json(errorResponse(error, 'Authentication failed. Please try again.'));
  }
};

// Admin registration with token validation
const adminRegisterHandler = async (req, res) => {
  try {
    const { email, password, full_name, adminToken } = req.body;

    const result = await adminRegister(email, password, full_name, adminToken);
    
    res.status(201).json(successResponse(result, 'Admin account created successfully'));
  } catch (error) {
    console.error('Admin registration error:', error);
    
    if (error.message === 'Admin account already exists') {
      return res.status(409).json(errorResponse(error, 'Admin account already exists'));
    }
    
    if (error.message === 'User with this email already exists') {
      return res.status(409).json(errorResponse(error, 'User with this email already exists'));
    }
    
    res.status(500).json(errorResponse(error, 'Admin registration failed. Please try again later.'));
  }
};

// Validate admin setup token
const validateAdminTokenHandler = async (req, res) => {
  try {
    const { adminToken } = req.body;

    const result = await validateAdminToken(adminToken);
    
    res.json(successResponse(result, result.isValid ? 'Valid admin token' : 'Invalid admin token'));
  } catch (error) {
    console.error('Admin token validation error:', error);
    
    if (error.message === 'Admin account already exists') {
      return res.status(409).json(errorResponse(error, 'Admin account already exists'));
    }
    
    res.status(500).json(errorResponse(error, 'Token validation failed'));
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfileHandler,
  changePasswordHandler,
  googleToken,
  googleIdToken,
  googleAuth,
  adminRegisterHandler,
  validateAdminTokenHandler
};