// src/modules/dm/router.js
// Direct Messaging routes

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../../core/http/middlewares/auth');
const { 
  listDMs,
  startDM,
  getDMMessages,
  archiveDM,
  markDMAsRead,
  pinDMMessage,
  unpinDMMessage
} = require('./controller');

// Public routes
router.get('/', authenticateToken, listDMs);
router.post('/start', authenticateToken, startDM);
router.get('/:dmId/messages', authenticateToken, getDMMessages);
router.post('/:dmId/archive', authenticateToken, archiveDM);
router.post('/:dmId/read', authenticateToken, markDMAsRead);
router.post('/:dmId/messages/:messageId/pin', authenticateToken, pinDMMessage);
router.post('/:dmId/messages/unpin', authenticateToken, unpinDMMessage);

module.exports = router;