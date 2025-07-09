const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('./auth-routes');

// List all groups (with search/filter)
router.get('/', async (req, res) => {
  const { search, category, featured, trending } = req.query;
  let query = 'SELECT * FROM groups WHERE 1=1';
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    query += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
  }
  if (category) {
    params.push(category);
    query += ` AND category = $${params.length}`;
  }
  if (featured) {
    params.push(true);
    query += ` AND is_featured = $${params.length}`;
  }
  if (trending) {
    params.push(true);
    query += ` AND is_trending = $${params.length}`;
  }
  query += ' ORDER BY is_featured DESC, is_trending DESC, name ASC';
  try {
    const { rows } = await pool.query(query, params);
    res.json({ success: true, groups: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/groups - Create a new public group
router.post('/create', authenticateToken, async (req, res) => {
  const { name, description, category, is_public } = req.body;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, error: 'Group name is required.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO groups (name, description, category, is_public, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description || '', category || null, is_public !== false, userId]
    );
    res.status(201).json({ success: true, group: result.rows[0] });
  } catch (err) {
    console.error('Error creating group:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Join a group
router.post('/:groupId/join', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const groupId = req.params.groupId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [groupId, userId]
    );
    res.json({ success: true, message: 'Joined group' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Leave a group
router.post('/:groupId/leave', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const groupId = req.params.groupId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    await pool.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    res.json({ success: true, message: 'Left group' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get group members
router.get('/:groupId/members', authenticateToken, async (req, res) => {
  const groupId = req.params.groupId;
  try {
    const { rows } = await pool.query(
      'SELECT u.id, u.full_name, u.profile_picture FROM group_members gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = $1',
      [groupId]
    );
    res.json({ success: true, members: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get group messages (with pagination)
router.get('/:groupId/messages', authenticateToken, async (req, res) => {
  const groupId = req.params.groupId;
  const { page = 1, pageSize = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  try {
    const { rows } = await pool.query(
      'SELECT gm.*, u.full_name, u.profile_picture FROM group_messages gm JOIN users u ON gm.user_id = u.id WHERE gm.group_id = $1 ORDER BY gm.created_at DESC LIMIT $2 OFFSET $3',
      [groupId, pageSize, offset]
    );
    res.json({ success: true, messages: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pin a message
router.post('/:groupId/messages/:messageId/pin', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const groupId = req.params.groupId;
  const messageId = req.params.messageId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    // Unpin all other messages in the group
    await pool.query(
      'UPDATE group_messages SET pinned = FALSE WHERE group_id = $1',
      [groupId]
    );
    // Pin the selected message
    await pool.query(
      'UPDATE group_messages SET pinned = TRUE WHERE id = $1 AND group_id = $2',
      [messageId, groupId]
    );
    res.json({ success: true, message: 'Message pinned' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Unpin all messages in a group
router.post('/:groupId/messages/unpin', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const groupId = req.params.groupId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    await pool.query(
      'UPDATE group_messages SET pinned = FALSE WHERE group_id = $1',
      [groupId]
    );
    res.json({ success: true, message: 'All messages unpinned' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mute/unmute group
router.post('/:groupId/mute', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const groupId = req.params.groupId;
  const { mute } = req.body;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    if (mute) {
      await pool.query(
        'INSERT INTO muted_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, groupId]
      );
      res.json({ success: true, message: 'Group muted' });
    } else {
      await pool.query(
        'DELETE FROM muted_groups WHERE user_id = $1 AND group_id = $2',
        [userId, groupId]
      );
      res.json({ success: true, message: 'Group unmuted' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get last_read_at for all groups for the current user
router.get('/last-read', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const { rows } = await pool.query(
      'SELECT group_id, last_read_at FROM last_read_at WHERE user_id = $1 AND group_id IS NOT NULL',
      [userId]
    );
    res.json({ success: true, lastRead: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/groups/:groupId - Delete a group (only creator can delete)
router.delete('/groups/:groupId', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const groupId = req.params.groupId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    // Check if the user is the creator of the group
    const groupResult = await pool.query('SELECT created_by FROM groups WHERE id = $1', [groupId]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    if (groupResult.rows[0].created_by !== userId) {
      return res.status(403).json({ success: false, error: 'Only the group creator can delete this group' });
    }
    // Delete the group (CASCADE will remove related members/messages)
    await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (err) {
    console.error('Error deleting group:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router; 