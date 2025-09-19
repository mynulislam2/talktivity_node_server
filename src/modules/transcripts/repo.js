// src/modules/transcripts/repo.js
// Transcripts data access layer

const { pool } = require('../../core/db/client');

const storeTranscript = async (userId, transcript, roomName, sessionDuration, agentState) => {
  const client = await pool.connect();
  try {
    // Updated query to match actual database schema (without agent_state column)
    const result = await client.query(`
      INSERT INTO conversations (user_id, transcript, room_name, session_duration, timestamp)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [userId, transcript, roomName || null, sessionDuration || null]);

    return result.rows[0];
  } finally {
    client.release();
  }
};

const getLatestConversations = async (userId, limit, offset) => {
  const client = await pool.connect();
  try {
    // Get all conversations for the user
    const conversationsResult = await client.query(`
      SELECT id, room_name, user_id, timestamp, transcript 
      FROM conversations 
      WHERE user_id = $1
      ORDER BY timestamp DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    // Count total conversations
    const countResult = await client.query(`
      SELECT COUNT(*) as total
      FROM conversations
      WHERE user_id = $1
    `, [userId]);
    
    const total = parseInt(countResult.rows[0].total);

    return {
      conversations: conversationsResult.rows,
      total
    };
  } finally {
    client.release();
  }
};

const getUserConversationExperience = async (userId) => {
  const client = await pool.connect();
  try {
    // Check if user has any conversations
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM conversations 
      WHERE user_id = $1
    `, [userId]);
    
    const hasConversations = parseInt(result.rows[0].count) > 0;

    return {
      hasConversationExperience: hasConversations,
      conversationCount: parseInt(result.rows[0].count)
    };
  } finally {
    client.release();
  }
};

module.exports = {
  storeTranscript,
  getLatestConversations,
  getUserConversationExperience
};