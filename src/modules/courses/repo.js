/**
 * Courses Module Repository
 */

const db = require('../../core/db/client');

const coursesRepo = {
  async getCourseById(courseId) {
    return await db.queryOne(
      `SELECT * FROM user_courses WHERE id = $1`,
      [courseId]
    );
  },

  async getUserCourseHistory(userId) {
    return await db.queryAll(
      `SELECT * FROM user_courses WHERE user_id = $1 ORDER BY week_number DESC`,
      [userId]
    );
  },

  async createCourse(userId, weekNumber, startDate, endDate) {
    return await db.queryOne(
      `INSERT INTO user_courses (user_id, week_number, start_date, end_date, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING *`,
      [userId, weekNumber, startDate, endDate]
    );
  },
};

module.exports = coursesRepo;
