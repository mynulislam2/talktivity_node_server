const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const {
  handleListGroups,
  handleCreateGroup,
  handleJoinGroup,
  handleLeaveGroup,
  handleGetMembers,
  handleGetMessages,
  handlePinMessage,
  handleUnpinMessages,
  handleMuteGroup,
  handleGetLastRead,
  handleDeleteGroup,
  handleGetJoinedGroups,
} = require('./controller');

/**
 * Group Chat Routes
 * 
 * GET /            - List all groups with optional filters
 * POST /create     - Create a new group
 * GET /joined      - Get groups user has joined
 * GET /last-read   - Get last read timestamps
 * 
 * POST /:groupId/join           - Join a group
 * POST /:groupId/leave          - Leave a group
 * POST /:groupId/mute           - Mute/unmute a group
 * DELETE /:groupId              - Delete a group (creator only)
 * 
 * GET /:groupId/members         - Get group members
 * GET /:groupId/messages        - Get group messages (paginated)
 * 
 * POST /:groupId/messages/:messageId/pin - Pin a message
 * POST /:groupId/messages/unpin          - Unpin all messages
 */

// List all groups with optional search/filter
router.get('/', authenticateToken, handleListGroups);

// Create a new group
router.post('/create', authenticateToken, handleCreateGroup);

// Join a group
router.post('/:groupId/join', authenticateToken, handleJoinGroup);

// Leave a group
router.post('/:groupId/leave', authenticateToken, handleLeaveGroup);

// Get group members
router.get('/:groupId/members', authenticateToken, handleGetMembers);

// Get group messages (paginated)
router.get('/:groupId/messages', authenticateToken, handleGetMessages);

// Pin a message
router.post('/:groupId/messages/:messageId/pin', authenticateToken, handlePinMessage);

// Unpin all messages
router.post('/:groupId/messages/unpin', authenticateToken, handleUnpinMessages);

// Mute/unmute group
router.post('/:groupId/mute', authenticateToken, handleMuteGroup);

// Get last read timestamps
router.get('/last-read', authenticateToken, handleGetLastRead);

// Delete a group (creator only)
router.delete('/:groupId', authenticateToken, handleDeleteGroup);

// Get groups user has joined
router.get('/joined', authenticateToken, handleGetJoinedGroups);

module.exports = router;
