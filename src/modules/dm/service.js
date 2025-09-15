// src/modules/dm/service.js
// Direct Messaging business logic

const db = require('../../core/db/client');

// List all DMs for the user
const fetchDMs = async (userId) => {
  let client;
  try {
    client = await db.pool.connect();
    console.log('✅ Fetching DMs for user:', userId);
    const { rows } = await client.query(
      `SELECT
        dms.id,
        array_agg(u.id) AS participant_ids,
        array_agg(u.full_name) AS participant_names,
        m.content AS last_message,
        m.created_at AS last_message_time,
        m.read AS last_message_read
      FROM dms
      JOIN dm_participants dp ON dms.id = dp.dm_id
      JOIN users u ON dp.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT content, created_at, read
        FROM dm_messages
        WHERE dm_id = dms.id
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON TRUE
      WHERE dms.id IN (
        SELECT dm_id FROM dm_participants WHERE user_id = $1
      )
      GROUP BY dms.id, m.content, m.created_at, m.read
      ORDER BY last_message_time DESC NULLS LAST`,
      [userId]
    );
    console.log('✅ Successfully fetched DMs, count:', rows.length);
    return { dms: rows };
  } finally {
    if (client) client.release();
  }
};

// Start a new DM
const createDM = async (userId, otherUserId) => {
  let client;
  try {
    client = await db.pool.connect();
    // Check if DM already exists
    const existing = await client.query(
      `SELECT dms.id FROM dms
       JOIN dm_participants dp1 ON dms.id = dp1.dm_id AND dp1.user_id = $1
       JOIN dm_participants dp2 ON dms.id = dp2.dm_id AND dp2.user_id = $2`,
      [userId, otherUserId]
    );
    let dmId;
    if (existing.rows.length > 0) {
      dmId = existing.rows[0].id;
    } else {
      // Create new DM
      const dmRes = await client.query('INSERT INTO dms DEFAULT VALUES RETURNING id');
      dmId = dmRes.rows[0].id;
      await client.query('INSERT INTO dm_participants (dm_id, user_id) VALUES ($1, $2), ($1, $3)', [dmId, userId, otherUserId]);
    }
    return { dmId };
  } finally {
    if (client) client.release();
  }
};

// Get DM messages (with pagination)
const fetchDMMessages = async (userId, dmId, pageSize, offset) => {
  let client;
  try {
    client = await db.pool.connect();
    // Check if user is a participant
    const check = await client.query('SELECT 1 FROM dm_participants WHERE dm_id = $1 AND user_id = $2', [dmId, userId]);
    if (check.rows.length === 0) throw new Error('Forbidden');
    
    const { rows } = await client.query(
      `SELECT dm_messages.*, u.full_name, u.profile_picture FROM dm_messages 
       JOIN users u ON dm_messages.sender_id = u.id
       WHERE dm_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [dmId, pageSize, offset]
    );
    return { messages: rows };
  } finally {
    if (client) client.release();
  }
};

// Archive/delete a DM (soft delete for user)
const archiveConversation = async () => {
  // For now, just return success (implement soft delete if needed)
  return { message: 'Archived (not implemented)' };
};

// Mark DM as read
const markAsRead = async (userId, dmId) => {
  let client;
  try {
    client = await db.pool.connect();
    await client.query(
      `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND dm_id = $2;
       INSERT INTO last_read_at (user_id, dm_id, last_read_at)
       SELECT $1, $2, NOW()
       WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND dm_id = $2);`,
      [userId, dmId]
    );
    return { message: 'Marked as read' };
  } finally {
    if (client) client.release();
  }
};

// Pin a DM message
const pinMessage = async (userId, dmId, messageId) => {
  let client;
  try {
    client = await db.pool.connect();
    // Unpin all other messages in the DM
    await client.query('UPDATE dm_messages SET pinned = FALSE WHERE dm_id = $1', [dmId]);
    // Pin the selected message
    await client.query('UPDATE dm_messages SET pinned = TRUE WHERE id = $1 AND dm_id = $2', [messageId, dmId]);
    return { message: 'Message pinned' };
  } finally {
    if (client) client.release();
  }
};

// Unpin all DM messages
const unpinMessage = async (userId, dmId) => {
  let client;
  try {
    client = await db.pool.connect();
    await client.query('UPDATE dm_messages SET pinned = FALSE WHERE dm_id = $1', [dmId]);
    return { message: 'All messages unpinned' };
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  fetchDMs,
  createDM,
  fetchDMMessages,
  archiveConversation,
  markAsRead,
  pinMessage,
  unpinMessage
};