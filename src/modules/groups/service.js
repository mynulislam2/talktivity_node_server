const db = require('../../core/db/client');
const { ValidationError, NotFoundError } = require('../../core/error/errors');

/**
 * List all groups with optional search/filter
 * @param {string} search - Search term for group name/description
 * @param {string} category - Filter by category
 * @param {boolean} featured - Filter by featured status
 * @param {boolean} trending - Filter by trending status
 * @returns {Promise<Array>} Array of groups with member counts
 */
async function listGroups(search, category, featured, trending) {
  let query = `
    SELECT 
      g.*,
      COALESCE(member_counts.member_count, 0) as member_count
    FROM groups g
    LEFT JOIN (
      SELECT gm.group_id, COUNT(u.id) as member_count
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      GROUP BY gm.group_id
    ) member_counts ON g.id = member_counts.group_id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (g.name ILIKE $${params.length} OR g.description ILIKE $${params.length})`;
  }

  if (category) {
    params.push(category);
    query += ` AND g.category = $${params.length}`;
  }

  if (featured) {
    params.push(true);
    query += ` AND g.is_featured = $${params.length}`;
  }

  if (trending) {
    params.push(true);
    query += ` AND g.is_trending = $${params.length}`;
  }

  query += ' ORDER BY g.is_featured DESC, g.is_trending DESC, g.name ASC';

  const { rows } = await db.query(query, params);

  // Ensure member_count is an integer
  return rows.map((row) => ({
    ...row,
    member_count: parseInt(row.member_count) || 0,
  }));
}

/**
 * Create a new group
 * @param {number} userId - Creator user ID
 * @param {string} name - Group name
 * @param {string} description - Group description
 * @param {string} category - Group category
 * @param {boolean} is_public - Public/private flag
 * @returns {Promise<Object>} Created group object
 */
async function createGroup(userId, name, description, category, is_public) {
  if (!userId) throw new ValidationError('User ID is required');
  if (!name || typeof name !== 'string' || name.trim() === '') {
    throw new ValidationError('Group name is required');
  }

  const trimmedName = name.trim();

  // Check for existing group (case-insensitive)
  const existing = await db.query('SELECT id FROM groups WHERE LOWER(name) = LOWER($1)', [
    trimmedName,
  ]);

  if (existing.rows.length > 0) {
    throw new ValidationError('Group name already exists');
  }

  const result = await db.query(
    'INSERT INTO groups (name, description, category, is_public, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [trimmedName, description || '', category || null, is_public !== false, userId]
  );

  return result.rows[0];
}

/**
 * Join a group
 * @param {number} userId - User ID
 * @param {number} groupId - Group ID
 * @returns {Promise<void>}
 */
async function joinGroup(userId, groupId) {
  if (!userId || !groupId) {
    throw new ValidationError('User ID and Group ID are required');
  }

  const groupCheck = await db.query('SELECT id FROM groups WHERE id = $1', [groupId]);

  if (groupCheck.rows.length === 0) {
    throw new NotFoundError('Group not found');
  }

  await db.query(
    'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [groupId, userId]
  );
}

/**
 * Leave a group
 * @param {number} userId - User ID
 * @param {number} groupId - Group ID
 * @returns {Promise<void>}
 */
async function leaveGroup(userId, groupId) {
  if (!userId || !groupId) {
    throw new ValidationError('User ID and Group ID are required');
  }

  const groupCheck = await db.query('SELECT id FROM groups WHERE id = $1', [groupId]);

  if (groupCheck.rows.length === 0) {
    throw new NotFoundError('Group not found');
  }

  await db.query(
    'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  );
}

/**
 * Get members of a group
 * @param {number} groupId - Group ID
 * @returns {Promise<Array>} Array of member objects
 */
async function getGroupMembers(groupId) {
  if (!groupId) {
    throw new ValidationError('Group ID is required');
  }

  const { rows } = await db.query(
    'SELECT u.id, u.full_name, u.profile_picture FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = $1',
    [groupId]
  );

  return rows;
}

/**
 * Get messages from a group with pagination
 * @param {number} groupId - Group ID
 * @param {number} page - Page number
 * @param {number} pageSize - Messages per page
 * @returns {Promise<Array>} Array of messages
 */
async function getGroupMessages(groupId, page = 1, pageSize = 30) {
  if (!groupId) {
    throw new ValidationError('Group ID is required');
  }

  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  const { rows } = await db.query(
    'SELECT gm.*, u.full_name, u.profile_picture FROM group_messages gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = $1 ORDER BY gm.created_at DESC LIMIT $2 OFFSET $3',
    [groupId, pageSize, offset]
  );

  return rows;
}

/**
 * Pin a message in a group (unpins all others)
 * @param {number} userId - User ID (for validation)
 * @param {number} groupId - Group ID
 * @param {number} messageId - Message ID to pin
 * @returns {Promise<void>}
 */
async function pinMessage(userId, groupId, messageId) {
  if (!userId || !groupId || !messageId) {
    throw new ValidationError('User ID, Group ID, and Message ID are required');
  }

  // Unpin all other messages in the group
  await db.query('UPDATE group_messages SET pinned = FALSE WHERE group_id = $1', [groupId]);

  // Pin the selected message
  await db.query(
    'UPDATE group_messages SET pinned = TRUE WHERE id = $1 AND group_id = $2',
    [messageId, groupId]
  );
}

/**
 * Unpin all messages in a group
 * @param {number} userId - User ID (for validation)
 * @param {number} groupId - Group ID
 * @returns {Promise<void>}
 */
async function unpinAllMessages(userId, groupId) {
  if (!userId || !groupId) {
    throw new ValidationError('User ID and Group ID are required');
  }

  await db.query('UPDATE group_messages SET pinned = FALSE WHERE group_id = $1', [groupId]);
}

/**
 * Mute or unmute a group
 * @param {number} userId - User ID
 * @param {number} groupId - Group ID
 * @param {boolean} mute - True to mute, false to unmute
 * @returns {Promise<void>}
 */
async function muteGroup(userId, groupId, mute) {
  if (!userId || !groupId) {
    throw new ValidationError('User ID and Group ID are required');
  }

  if (mute) {
    await db.query(
      'INSERT INTO muted_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, groupId]
    );
  } else {
    await db.query('DELETE FROM muted_groups WHERE user_id = $1 AND group_id = $2', [
      userId,
      groupId,
    ]);
  }
}

/**
 * Get last read timestamps for all groups for a user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of last_read_at records
 */
async function getLastReadStatus(userId) {
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  const { rows } = await db.query(
    'SELECT group_id, last_read_at FROM last_read_at WHERE user_id = $1 AND group_id IS NOT NULL',
    [userId]
  );

  return rows;
}

/**
 * Delete a group (only creator can delete)
 * @param {number} userId - User ID (must be creator)
 * @param {number} groupId - Group ID
 * @returns {Promise<void>}
 */
async function deleteGroup(userId, groupId) {
  if (!userId || !groupId) {
    throw new ValidationError('User ID and Group ID are required');
  }

  const groupResult = await db.query('SELECT created_by FROM groups WHERE id = $1', [groupId]);

  if (groupResult.rows.length === 0) {
    throw new NotFoundError('Group not found');
  }

  if (groupResult.rows[0].created_by !== userId) {
    throw new ValidationError('Only the group creator can delete this group');
  }

  // Delete the group (CASCADE will remove related members/messages)
  await db.query('DELETE FROM groups WHERE id = $1', [groupId]);
}

/**
 * Get groups the user has joined
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of joined groups
 */
async function getJoinedGroups(userId) {
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  const { rows } = await db.query(
    `
    SELECT g.*, 
           (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count
    FROM groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = $1
    ORDER BY g.name ASC
  `,
    [userId]
  );

  return rows;
}

module.exports = {
  listGroups,
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupMembers,
  getGroupMessages,
  pinMessage,
  unpinAllMessages,
  muteGroup,
  getLastReadStatus,
  deleteGroup,
  getJoinedGroups,
};
