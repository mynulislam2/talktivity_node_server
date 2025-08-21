const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('./auth-routes');

// List all DMs for the user
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const { rows } = await pool.query(
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
    res.json({ success: true, dms: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Unable to retrieve conversations at this time. Please try again later.' });
  }
});

// Start a new DM
router.post('/start', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const { otherUserId } = req.body;
  if (!userId || !otherUserId) return res.status(400).json({ success: false, error: 'Missing user(s)' });
  try {
    // Check if DM already exists
    const existing = await pool.query(
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
      const dmRes = await pool.query('INSERT INTO dms DEFAULT VALUES RETURNING id');
      dmId = dmRes.rows[0].id;
      await pool.query('INSERT INTO dm_participants (dm_id, user_id) VALUES ($1, $2), ($1, $3)', [dmId, userId, otherUserId]);
    }
    res.json({ success: true, dmId });
  } catch (err) {
    console.error('Error creating DM conversation:', err);
    res.status(500).json({ success: false, error: 'Unable to create conversation at this time. Please try again later.' });
  }
});

// Get DM messages (with pagination)
router.get('/:dmId/messages', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const dmId = req.params.dmId;
  const { page = 1, pageSize = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    // Check if user is a participant
    const check = await pool.query('SELECT 1 FROM dm_participants WHERE dm_id = $1 AND user_id = $2', [dmId, userId]);
    if (check.rows.length === 0) return res.status(403).json({ success: false, error: 'Forbidden' });
    const { rows } = await pool.query(
      `SELECT dm_messages.*, u.full_name, u.profile_picture FROM dm_messages 
       JOIN users u ON dm_messages.sender_id = u.id
       WHERE dm_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [dmId, pageSize, offset]
    );
    res.json({ success: true, messages: rows });
  } catch (err) {
    console.error('Error fetching DM messages:', err);
    res.status(500).json({ success: false, error: 'Unable to retrieve messages at this time. Please try again later.' });
  }
});

// Archive/delete a DM (soft delete for user)
router.post('/:dmId/archive', authenticateToken, async (req, res) => {
  // For now, just return success (implement soft delete if needed)
  res.json({ success: true, message: 'Archived (not implemented)' });
});

// Mark DM as read
router.post('/:dmId/read', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const dmId = req.params.dmId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    await pool.query(
      `UPDATE last_read_at SET last_read_at = NOW() WHERE user_id = $1 AND dm_id = $2;
       INSERT INTO last_read_at (user_id, dm_id, last_read_at)
       SELECT $1, $2, NOW()
       WHERE NOT EXISTS (SELECT 1 FROM last_read_at WHERE user_id = $1 AND dm_id = $2);`,
      [userId, dmId]
    );
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    console.error('Error marking DM as read:', err);
    res.status(500).json({ success: false, error: 'Unable to mark conversation as read at this time. Please try again later.' });
  }
});

// Pin a DM message
router.post('/:dmId/messages/:messageId/pin', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const dmId = req.params.dmId;
  const messageId = req.params.messageId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    // Unpin all other messages in the DM
    await pool.query('UPDATE dm_messages SET pinned = FALSE WHERE dm_id = $1', [dmId]);
    // Pin the selected message
    await pool.query('UPDATE dm_messages SET pinned = TRUE WHERE id = $1 AND dm_id = $2', [messageId, dmId]);
    res.json({ success: true, message: 'Message pinned' });
  } catch (err) {
    console.error('Error pinning DM message:', err);
    res.status(500).json({ success: false, error: 'Unable to pin message at this time. Please try again later.' });
  }
});

// Unpin all DM messages
router.post('/:dmId/messages/unpin', authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const dmId = req.params.dmId;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    await pool.query('UPDATE dm_messages SET pinned = FALSE WHERE dm_id = $1', [dmId]);
    res.json({ success: true, message: 'All messages unpinned' });
  } catch (err) {
    console.error('Error unpinning DM message:', err);
    res.status(500).json({ success: false, error: 'Unable to unpin message at this time. Please try again later.' });
  }
});

module.exports = router; 