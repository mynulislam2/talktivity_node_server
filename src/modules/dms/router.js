const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const {
  getDMList,
  createDM,
  getMessages,
  markAsRead,
  pinMessage,
  unpinMessages,
  archive,
} = require('./controller');

/**
 * DM Routes
 * 
 * GET /       - List all DMs for the user
 * POST /start - Start a new DM conversation
 * 
 * GET /:dmId/messages                 - Get messages from a DM (paginated)
 * POST /:dmId/read                    - Mark DM as read
 * POST /:dmId/archive                 - Archive a DM
 * POST /:dmId/messages/:messageId/pin - Pin a message
 * POST /:dmId/messages/unpin          - Unpin all messages
 */

// List all DMs for the authenticated user
router.get('/', authenticateToken, getDMList);

// Start a new DM conversation
router.post('/start', authenticateToken, createDM);

// Get messages from a DM conversation (with pagination)
router.get('/:dmId/messages', authenticateToken, getMessages);

// Mark a DM conversation as read
router.post('/:dmId/read', authenticateToken, markAsRead);

// Archive a DM conversation
router.post('/:dmId/archive', authenticateToken, archive);

// Pin a message in a DM
router.post('/:dmId/messages/:messageId/pin', authenticateToken, pinMessage);

// Unpin all messages in a DM
router.post('/:dmId/messages/unpin', authenticateToken, unpinMessages);

module.exports = router;
