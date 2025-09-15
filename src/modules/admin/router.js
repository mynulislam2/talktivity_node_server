// src/modules/admin/router.js
// Admin routes

const express = require('express');
const router = express.Router();

const { authenticateToken, requireAdmin } = require('../../core/http/middlewares/auth');
const { 
  getUsers,
  removeUser,
  getStats
} = require('./controller');

// Protected routes - admin only
router.get('/users', authenticateToken, requireAdmin, getUsers);
router.delete('/users/:userId', authenticateToken, requireAdmin, removeUser);
router.get('/stats', authenticateToken, requireAdmin, getStats);

module.exports = router;