// src/modules/dm/controller.js
// Direct Messaging request handlers

const { 
  fetchDMs,
  createDM,
  fetchDMMessages,
  archiveConversation,
  markAsRead,
  pinMessage,
  unpinMessage
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// List all DMs for the user
const listDMs = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));
    
    const result = await fetchDMs(userId);
    res.status(200).json(successResponse(result, 'DMs retrieved successfully'));
  } catch (error) {
    console.error('Error fetching DMs:', error);
    res.status(500).json(errorResponse('Unable to retrieve conversations at this time. Please try again later.'));
  }
};

// Start a new DM
const startDM = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { otherUserId } = req.body;
    if (!userId || !otherUserId) return res.status(400).json(errorResponse('Missing user(s)'));
    
    const result = await createDM(userId, otherUserId);
    res.status(200).json(successResponse(result, 'DM started successfully'));
  } catch (error) {
    console.error('Error creating DM conversation:', error);
    res.status(500).json(errorResponse('Unable to create conversation at this time. Please try again later.'));
  }
};

// Get DM messages (with pagination)
const getDMMessages = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;
    const { page = 1, pageSize = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));
    
    const result = await fetchDMMessages(userId, dmId, pageSize, offset);
    res.status(200).json(successResponse(result, 'DM messages retrieved successfully'));
  } catch (error) {
    console.error('Error fetching DM messages:', error);
    res.status(500).json(errorResponse('Unable to retrieve messages at this time. Please try again later.'));
  }
};

// Archive/delete a DM (soft delete for user)
const archiveDM = async (req, res) => {
  try {
    // For now, just return success (implement soft delete if needed)
    const result = await archiveConversation();
    res.status(200).json(successResponse(result, 'Archived successfully'));
  } catch (error) {
    console.error('Error archiving DM:', error);
    res.status(500).json(errorResponse('Unable to archive conversation at this time. Please try again later.'));
  }
};

// Mark DM as read
const markDMAsRead = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));
    
    const result = await markAsRead(userId, dmId);
    res.status(200).json(successResponse(result, 'Marked as read successfully'));
  } catch (error) {
    console.error('Error marking DM as read:', error);
    res.status(500).json(errorResponse('Unable to mark conversation as read at this time. Please try again later.'));
  }
};

// Pin a DM message
const pinDMMessage = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;
    const messageId = req.params.messageId;
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));
    
    const result = await pinMessage(userId, dmId, messageId);
    res.status(200).json(successResponse(result, 'Message pinned successfully'));
  } catch (error) {
    console.error('Error pinning DM message:', error);
    res.status(500).json(errorResponse('Unable to pin message at this time. Please try again later.'));
  }
};

// Unpin all DM messages
const unpinDMMessage = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;
    if (!userId) return res.status(401).json(errorResponse('Unauthorized'));
    
    const result = await unpinMessage(userId, dmId);
    res.status(200).json(successResponse(result, 'All messages unpinned successfully'));
  } catch (error) {
    console.error('Error unpinning DM message:', error);
    res.status(500).json(errorResponse('Unable to unpin message at this time. Please try again later.'));
  }
};

module.exports = {
  listDMs,
  startDM,
  getDMMessages,
  archiveDM,
  markDMAsRead,
  pinDMMessage,
  unpinDMMessage
};