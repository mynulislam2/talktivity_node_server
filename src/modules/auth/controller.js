// src/modules/auth/controller.js
// Authentication request handlers

const { 
  registerUser, 
  loginUser, 
  refreshUserToken, 
  getUserProfile, 
  updateProfile, 
  changePassword 
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

module.exports = {
  register,
  login,
  refreshToken,
  getProfile,
  updateProfileHandler,
  changePasswordHandler
};