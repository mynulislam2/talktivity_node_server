// src/modules/admin/controller.js
// Admin request handlers

const { 
  getAllUsers,
  deleteUser,
  getUserStats
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// Get all users with search and pagination
const getUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    
    const result = await getAllUsers(search, page, limit);
    
    res.json(successResponse(result, 'Users retrieved successfully'));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json(errorResponse('Unable to retrieve user list at this time. Please try again later.'));
  }
};

// Delete user and all related data
const removeUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await deleteUser(userId);
    
    res.json(successResponse(result, 'User deleted successfully'));
  } catch (error) {
    console.error('Error deleting user:', error);
    if (error.message === 'User not found') {
      return res.status(404).json(errorResponse('User not found'));
    }
    res.status(500).json(errorResponse('Unable to delete user at this time. Please try again later.'));
  }
};

// Get user statistics
const getStats = async (req, res) => {
  try {
    const stats = await getUserStats();
    
    res.json(successResponse(stats, 'User statistics retrieved successfully'));
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json(errorResponse('Unable to retrieve user statistics at this time. Please try again later.'));
  }
};

module.exports = {
  getUsers,
  removeUser,
  getStats
};