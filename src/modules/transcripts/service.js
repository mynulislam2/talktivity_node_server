// src/modules/transcripts/service.js
// Transcripts business logic

const { 
  storeTranscript,
  getLatestConversations,
  getUserConversationExperience
} = require('./repo');

const createTranscript = async (userId, transcript, roomName, sessionDuration, agentState) => {
  if (!userId || !transcript) {
    throw new Error('user_id and transcript are required');
  }
  
  return await storeTranscript(userId, transcript, roomName, sessionDuration, agentState);
};

const fetchLatestConversations = async (userId, limit, offset) => {
  if (!userId) {
    throw new Error('user_id is required');
  }
  
  return await getLatestConversations(userId, limit, offset);
};

const checkUserConversationExperience = async (userId) => {
  if (!userId) {
    throw new Error('user_id is required');
  }
  
  return await getUserConversationExperience(userId);
};

module.exports = {
  createTranscript,
  fetchLatestConversations,
  checkUserConversationExperience
};