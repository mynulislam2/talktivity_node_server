// src/modules/groups/repo.js
// Groups data access layer

const { pool } = require('../../core/db/client');

const getAllGroups = async (search, category, featured, trending) => {
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
  query += " ORDER BY g.is_featured DESC, g.is_trending DESC, g.name ASC";
  
  const client = await pool.connect();
  try {
    const { rows } = await client.query(query, params);
    
    // Ensure member_count is an integer
    const processedRows = rows.map((row) => ({
      ...row,
      member_count: parseInt(row.member_count) || 0,
    }));
    
    return processedRows;
  } finally {
    client.release();
  }
};

const createGroup = async (name, description, category, isPublic, createdBy) => {
  const client = await pool.connect();
  try {
    // Check for existing group (case-insensitive)
    const existing = await client.query(
      "SELECT id FROM groups WHERE LOWER(name) = LOWER($1)",
      [name.trim()]
    );
    if (existing.rows.length > 0) {
      throw new Error('Group name already exists');
    }
    
    const result = await client.query(
      "INSERT INTO groups (name, description, category, is_public, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name.trim(), description || "", category || null, isPublic !== false, createdBy]
    );
    
    return result.rows[0];
  } finally {
    client.release();
  }
};

const joinGroup = async (groupId, userId) => {
  const client = await pool.connect();
  try {
    const groupCheck = await client.query("SELECT id FROM groups WHERE id = $1", [groupId]);
    if (groupCheck.rows.length === 0) {
      throw new Error('Group not found');
    }
    
    await client.query(
      "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [groupId, userId]
    );
  } finally {
    client.release();
  }
};

const leaveGroup = async (groupId, userId) => {
  const client = await pool.connect();
  try {
    const groupCheck = await client.query("SELECT id FROM groups WHERE id = $1", [groupId]);
    if (groupCheck.rows.length === 0) {
      throw new Error('Group not found');
    }
    
    await client.query(
      "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2",
      [groupId, userId]
    );
  } finally {
    client.release();
  }
};

const getGroupMembers = async (groupId) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      "SELECT u.id, u.full_name, u.profile_picture FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = $1",
      [groupId]
    );
    
    return {
      members: rows,
      member_count: rows.length
    };
  } finally {
    client.release();
  }
};

const getJoinedGroups = async (userId) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT g.*, 
             (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = $1
      ORDER BY g.name ASC
    `, [userId]);
    
    return rows;
  } finally {
    client.release();
  }
};

const deleteGroup = async (groupId, userId) => {
  const client = await pool.connect();
  try {
    // Check if the user is the creator of the group
    const groupResult = await client.query(
      "SELECT created_by FROM groups WHERE id = $1",
      [groupId]
    );
    if (groupResult.rows.length === 0) {
      throw new Error('Group not found');
    }
    if (groupResult.rows[0].created_by !== userId) {
      throw new Error('Only the group creator can delete this group');
    }
    
    // Delete the group (CASCADE will remove related members/messages)
    await client.query("DELETE FROM groups WHERE id = $1", [groupId]);
  } finally {
    client.release();
  }
};

module.exports = {
  getAllGroups,
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupMembers,
  getJoinedGroups,
  deleteGroup
};