const db = require('../../core/db/client');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

/**
 * List all DMs for a user
 * @param {number} userId - The user ID
 * @returns {Promise<Array>} Array of DM conversations with last message info
 */
async function listDMs(userId) {
  if (!userId) throw new ValidationError('User ID is required');
  
  const { rows } = await db.query(
    `SELECT
      d.id,
      ARRAY[d.user1_id, d.user2_id] AS participant_ids,
      ARRAY[u1.full_name, u2.full_name] AS participant_names,
      m.content AS last_message,
      m.created_at AS last_message_time,
      m.read AS last_message_read
    FROM dms d
    JOIN users u1 ON d.user1_id = u1.id
    JOIN users u2 ON d.user2_id = u2.id
    LEFT JOIN LATERAL (
      SELECT content, created_at, read
      FROM dm_messages
      WHERE dm_id = d.id
      ORDER BY created_at DESC
      LIMIT 1
    ) m ON TRUE
    WHERE $1 IN (d.user1_id, d.user2_id)
    ORDER BY last_message_time DESC NULLS LAST`,
    [userId]
  );
  
  return rows;
}

/**
 * Start a new DM conversation or retrieve existing one
 * @param {number} userId - The current user ID
 * @param {number} otherUserId - The other user ID
 * @returns {Promise<number>} The DM conversation ID
 */
async function startDM(userId, otherUserId) {
  if (!userId || !otherUserId) {
    throw new ValidationError('Both user IDs are required');
  }

  // Normalize ordering so (user1,user2) and (user2,user1) map to same row
  const userA = Math.min(userId, otherUserId);
  const userB = Math.max(userId, otherUserId);

  // Check if DM already exists for this pair
  const existing = await db.query(
    `SELECT id FROM dms WHERE user1_id = $1 AND user2_id = $2`,
    [userA, userB]
  );
  
  let dmId;
  if (existing.rows.length > 0) {
    dmId = existing.rows[0].id;
  } else {
    // Create new DM
    const dmRes = await db.query(
      'INSERT INTO dms (user1_id, user2_id) VALUES ($1, $2) RETURNING id',
      [userA, userB]
    );
    dmId = dmRes.rows[0].id;
  }
  
  return dmId;
}

/**
 * Get messages from a DM conversation with pagination
 * @param {number} userId - The requesting user ID (for validation)
 * @param {number} dmId - The DM conversation ID
 * @param {number} page - Page number (default 1)
 * @param {number} pageSize - Messages per page (default 30)
 * @returns {Promise<Array>} Array of DM messages
 */
async function getDMMessages(userId, dmId, page = 1, pageSize = 30) {
  if (!userId || !dmId) {
    throw new ValidationError('User ID and DM ID are required');
  }
  
  // Check if user is a participant via dms.user1_id/user2_id
  const check = await db.query(
    'SELECT 1 FROM dms WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
    [dmId, userId]
  );
  if (check.rows.length === 0) {
    throw new NotFoundError('User is not a participant in this conversation');
  }
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const { rows } = await db.query(
    `SELECT dm_messages.*, u.full_name, u.profile_picture FROM dm_messages 
     JOIN users u ON dm_messages.sender_id = u.id
     WHERE dm_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [dmId, pageSize, offset]
  );
  
  return rows;
}

/**
 * Mark a DM conversation as read
 * @param {number} userId - The user ID
 * @param {number} dmId - The DM conversation ID
 * @returns {Promise<void>}
 */
async function markDMAsRead(userId, dmId) {
  if (!userId || !dmId) {
    throw new ValidationError('User ID and DM ID are required');
  }
  
  await db.query(
    `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND dm_id = $2;
     INSERT INTO last_read_at (user_id, dm_id, last_read_at)
     SELECT $1, $2, NOW()
     WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND dm_id = $2);`,
    [userId, dmId]
  );
}

/**
 * Pin a message in a DM conversation (unpins all others)
 * @param {number} userId - The user ID (for validation)
 * @param {number} dmId - The DM conversation ID
 * @param {number} messageId - The message ID to pin
 * @returns {Promise<void>}
 */
async function pinDMMessage(userId, dmId, messageId) {
  if (!userId || !dmId || !messageId) {
    throw new ValidationError('User ID, DM ID, and message ID are required');
  }
  
  // Unpin all other messages in the DM
  await db.query('UPDATE dm_messages SET pinned = FALSE WHERE dm_id = $1', [dmId]);
  
  // Pin the selected message
  await db.query(
    'UPDATE dm_messages SET pinned = TRUE WHERE id = $1 AND dm_id = $2',
    [messageId, dmId]
  );
}

/**
 * Unpin all messages in a DM conversation
 * @param {number} userId - The user ID (for validation)
 * @param {number} dmId - The DM conversation ID
 * @returns {Promise<void>}
 */
async function unpinAllDMMessages(userId, dmId) {
  if (!userId || !dmId) {
    throw new ValidationError('User ID and DM ID are required');
  }
  
  await db.query('UPDATE dm_messages SET pinned = FALSE WHERE dm_id = $1', [dmId]);
}

/**
 * Archive a DM conversation for a user (soft delete)
 * @param {number} userId - The user ID
 * @param {number} dmId - The DM conversation ID
 * @returns {Promise<void>}
 */
async function archiveDM(userId, dmId) {
  if (!userId || !dmId) {
    throw new ValidationError('User ID and DM ID are required');
  }
  
  // Implementation for soft delete - placeholder for now
  // TODO: Implement soft delete logic when dm_archived table structure is defined
}

module.exports = {
  listDMs,
  startDM,
  getDMMessages,
  markDMAsRead,
  pinDMMessage,
  unpinAllDMMessages,
  archiveDM,
};
