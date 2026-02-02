/**
 * Roleplays Module Service
 * Stores per-user roleplay scenarios in roleplay_sessions table.
 */

const db = require('../../core/db/client');

const ROLEPLAY_BASIC_LIMIT = 5;

async function getUserPlanType(userId) {
  const subscription = await db.queryOne(
    `SELECT s.*, sp.plan_type
     FROM subscriptions s
     JOIN subscription_plans sp ON s.plan_id = sp.id
     WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [userId]
  );

  // Treat "no subscription" as Basic/FreeTrial for limits
  return subscription?.plan_type || 'Basic';
}

const roleplaysService = {
  async listUserRoleplays(userId) {
    return await db.queryAll(
      `SELECT id, user_id, title, prompt, first_prompt, my_role, other_role, situation, image_url, created_at, updated_at
       FROM roleplay_sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [userId]
    );
  },

  async createUserRoleplay(userId, data) {
    const planType = await getUserPlanType(userId);
    const isLimited = planType === 'Basic' || planType === 'FreeTrial';

    if (isLimited) {
      const countRow = await db.queryOne(
        `SELECT COUNT(*)::int AS count
         FROM roleplay_sessions
         WHERE user_id = $1`,
        [userId]
      );
      const count = countRow?.count ?? 0;
      if (count >= ROLEPLAY_BASIC_LIMIT) {
        const err = new Error('Maximum role-play scenarios limit reached (5). Upgrade to Pro for unlimited.');
        err.statusCode = 403;
        throw err;
      }
    }

    const created = await db.queryOne(
      `INSERT INTO roleplay_sessions
       (user_id, title, prompt, first_prompt, my_role, other_role, situation, image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, user_id, title, prompt, first_prompt, my_role, other_role, situation, image_url, created_at, updated_at`,
      [
        userId,
        data.title,
        data.prompt,
        data.firstPrompt,
        data.myRole,
        data.otherRole,
        data.situation,
        data.imageUrl,
      ]
    );

    return created;
  },

  async deleteUserRoleplay(userId, roleplayId) {
    const deleted = await db.queryOne(
      `DELETE FROM roleplay_sessions
       WHERE user_id = $1 AND id = $2
       RETURNING id`,
      [userId, parseInt(roleplayId)]
    );

    if (!deleted) {
      const err = new Error('Roleplay not found');
      err.statusCode = 404;
      throw err;
    }

    return true;
  },
};

module.exports = roleplaysService;

