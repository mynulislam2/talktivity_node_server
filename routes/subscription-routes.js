const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/subscription/status/:userId
router.get('/subscription/status/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid userId' });
    }

    const { rows } = await db.pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM user_courses
         WHERE user_id = $1 AND is_active = true AND NOW()::date BETWEEN course_start_date AND course_end_date
       ) AS active`,
      [userId]
    );

    const active = !!rows?.[0]?.active;
    return res.status(200).json({ success: true, data: { active } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch subscription status' });
  }
});

module.exports = router;


