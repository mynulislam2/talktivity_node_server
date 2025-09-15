// src/modules/groups/router.js
// Groups routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { createGroupValidation, joinGroupValidation } = require('./schema');
const { 
  list,
  create,
  join,
  leave,
  getMembers,
  getJoined,
  remove
} = require('./controller');

// Public routes
router.get('/', authenticateToken, list);

// Protected routes
router.post('/create', authenticateToken, createGroupValidation, create);
router.post('/:groupId/join', authenticateToken, joinGroupValidation, join);
router.post('/:groupId/leave', authenticateToken, joinGroupValidation, leave);
router.get('/:groupId/members', authenticateToken, getMembers);
router.get('/joined', authenticateToken, getJoined);
router.delete('/:groupId', authenticateToken, remove);

module.exports = router;