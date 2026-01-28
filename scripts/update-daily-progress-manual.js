/**
 * Manual Daily Progress Update Script
 * 
 * Allows manual updates to daily_progress table, specifically for setting
 * speaking_started_at and roleplay_started_at timestamps.
 * 
 * Usage:
 *   node scripts/update-daily-progress-manual.js <userId> <date> <updates>
 * 
 * Examples:
 *   node scripts/update-daily-progress-manual.js 843 2026-01-27 '{"speaking_started_at":"2026-01-27T10:00:00.000Z"}'
 *   node scripts/update-daily-progress-manual.js 843 2026-01-27 '{"roleplay_started_at":"2026-01-27T11:00:00.000Z","speaking_started_at":"2026-01-27T10:00:00.000Z"}'
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

// Use the same environment variable names as the main db/index.js
const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: {
    rejectUnauthorized: false // Disable SSL verification for development (matches db/index.js)
  },
});

async function updateDailyProgress(userId, date, updates) {
  // Validate required environment variables
  const requiredVars = ['PG_HOST', 'PG_DATABASE', 'PG_USER', 'PG_PASSWORD'];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}. Please check your .env file.`);
  }

  // Ensure password is a string (not null/undefined)
  if (typeof process.env.PG_PASSWORD !== 'string') {
    throw new Error('PG_PASSWORD must be a string. Please check your .env file.');
  }

  const client = await pool.connect();
  try {
    // Parse updates JSON if it's a string
    let updateObj;
    if (typeof updates === 'string') {
      updateObj = JSON.parse(updates);
    } else {
      updateObj = updates;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }

    // Get course context to ensure week_number and day_number are correct
    const courseResult = await client.query(
      `SELECT id, course_start_date
       FROM user_courses
       WHERE user_id = $1 AND is_active = true
       LIMIT 1`,
      [userId]
    );

    if (courseResult.rows.length === 0) {
      throw new Error(`No active course found for user ${userId}`);
    }

    const course = courseResult.rows[0];
    const courseStart = new Date(course.course_start_date);
    const targetDate = new Date(date + 'T00:00:00.000Z');

    // Calculate week and day numbers
    const daysSinceStart = Math.max(
      0,
      Math.round((targetDate - courseStart) / (1000 * 60 * 60 * 24))
    );
    const weekNumber = Math.floor(daysSinceStart / 7) + 1;
    const dayNumber = (daysSinceStart % 7) + 1;

    console.log(`\n📊 Updating daily_progress for user ${userId}`);
    console.log(`   Date: ${date}`);
    console.log(`   Course ID: ${course.id}`);
    console.log(`   Week: ${weekNumber}, Day: ${dayNumber}`);
    console.log(`   Updates:`, updateObj);

    // Build SET clause dynamically
    const allowedFields = [
      'course_id', 'week_number', 'day_number',
      'speaking_completed', 'speaking_started_at', 'speaking_ended_at', 'speaking_duration_seconds',
      'speaking_quiz_completed', 'speaking_quiz_score',
      'listening_completed', 'listening_quiz_completed', 'listening_quiz_score',
      'roleplay_completed', 'roleplay_started_at', 'roleplay_ended_at', 'roleplay_duration_seconds',
      'total_time_seconds',
    ];

    // Filter and validate update fields
    const validUpdates = {};
    for (const [key, value] of Object.entries(updateObj)) {
      if (!allowedFields.includes(key)) {
        console.warn(`⚠️  Warning: Field "${key}" is not in allowed fields list. Skipping.`);
        continue;
      }
      // Skip course_id, week_number, day_number as we'll set them explicitly
      if (key !== 'course_id' && key !== 'week_number' && key !== 'day_number') {
        validUpdates[key] = value;
      }
    }

    // Build INSERT columns and values
    const insertColumns = ['user_id', 'progress_date', 'course_id', 'week_number', 'day_number'];
    const insertValues = ['$1', '$2', '$3', '$4', '$5'];
    const values = [userId, date, course.id, weekNumber, dayNumber];
    let paramIndex = 6;

    // Add user-specified fields to INSERT
    for (const [key, value] of Object.entries(validUpdates)) {
      insertColumns.push(key);
      insertValues.push(`$${paramIndex++}`);
      values.push(value);
    }

    // Build UPDATE SET clause
    const updateFields = [
      'course_id = EXCLUDED.course_id',
      'week_number = EXCLUDED.week_number',
      'day_number = EXCLUDED.day_number',
    ];

    // Add user-specified updates
    for (const [key, value] of Object.entries(validUpdates)) {
      if (key === 'speaking_started_at' || key === 'roleplay_started_at') {
        // For started_at fields, use COALESCE to preserve existing value if already set
        updateFields.push(`${key} = COALESCE(daily_progress.${key}, EXCLUDED.${key})`);
      } else {
        updateFields.push(`${key} = EXCLUDED.${key}`);
      }
    }

    updateFields.push('updated_at = NOW()');

    const query = `
      INSERT INTO daily_progress (${insertColumns.join(', ')})
      VALUES (${insertValues.join(', ')})
      ON CONFLICT (user_id, progress_date) DO UPDATE SET
        ${updateFields.join(',\n        ')}
      RETURNING *
    `;

    console.log(`\n🔍 Executing query...`);
    const result = await client.query(query, values);

    if (result.rows.length > 0) {
      const progress = result.rows[0];
      console.log(`\n✅ Successfully updated daily_progress!`);
      console.log(`\n📋 Updated record:`);
      console.log(`   ID: ${progress.id}`);
      console.log(`   Progress Date: ${progress.progress_date}`);
      console.log(`   Week: ${progress.week_number}, Day: ${progress.day_number}`);
      console.log(`   Speaking Started At: ${progress.speaking_started_at || 'null'}`);
      console.log(`   Speaking Ended At: ${progress.speaking_ended_at || 'null'}`);
      console.log(`   Speaking Duration: ${progress.speaking_duration_seconds || 0}s`);
      console.log(`   Speaking Completed: ${progress.speaking_completed || false}`);
      console.log(`   Roleplay Started At: ${progress.roleplay_started_at || 'null'}`);
      console.log(`   Roleplay Ended At: ${progress.roleplay_ended_at || 'null'}`);
      console.log(`   Roleplay Duration: ${progress.roleplay_duration_seconds || 0}s`);
      console.log(`   Roleplay Completed: ${progress.roleplay_completed || false}`);
      return progress;
    } else {
      throw new Error('Update completed but no row returned');
    }
  } catch (error) {
    console.error('\n❌ Error updating daily_progress:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Usage: node scripts/update-daily-progress-manual.js <userId> <date> <updates>

Arguments:
  userId  - User ID (number)
  date    - Date in YYYY-MM-DD format
  updates - JSON string with fields to update

Examples:
  # Set speaking_started_at
  node scripts/update-daily-progress-manual.js 843 2026-01-27 '{"speaking_started_at":"2026-01-27T10:00:00.000Z"}'

  # Set both speaking_started_at and roleplay_started_at
  node scripts/update-daily-progress-manual.js 843 2026-01-27 '{"speaking_started_at":"2026-01-27T10:00:00.000Z","roleplay_started_at":"2026-01-27T11:00:00.000Z"}'

  # Set started_at and mark as completed
  node scripts/update-daily-progress-manual.js 843 2026-01-27 '{"speaking_started_at":"2026-01-27T10:00:00.000Z","speaking_ended_at":"2026-01-27T10:05:00.000Z","speaking_duration_seconds":300,"speaking_completed":true}'

Allowed fields:
  - speaking_started_at, speaking_ended_at, speaking_duration_seconds, speaking_completed
  - roleplay_started_at, roleplay_ended_at, roleplay_duration_seconds, roleplay_completed
  - speaking_quiz_completed, speaking_quiz_score
  - listening_completed, listening_quiz_completed, listening_quiz_score
  - total_time_seconds
    `);
    process.exit(1);
  }

  const [userId, date, updatesJson] = args;
  const userIdNum = parseInt(userId, 10);

  if (isNaN(userIdNum)) {
    console.error('❌ Error: userId must be a number');
    process.exit(1);
  }

  updateDailyProgress(userIdNum, date, updatesJson)
    .then(() => {
      console.log('\n✨ Done!');
      return pool.end();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed:', error.message);
      pool.end().finally(() => {
        process.exit(1);
      });
    });
}

module.exports = { updateDailyProgress };
