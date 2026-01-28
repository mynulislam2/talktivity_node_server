/*
 Backfill user_lifecycle table from legacy sources.
 - Copies boolean flags from users table when present
 - Aggregates lifetime call seconds from lifetime_call_usage or device_speaking_sessions
 - Creates user_lifecycle rows for any users missing an entry
 Usage:
   node Agentserver/db/backfill_user_lifecycle.js
*/

const { pool } = require('./index');

async function columnExists(client, table, column) {
  const q = `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`;
  const r = await client.query(q, [table, column]);
  return r.rowCount > 0;
}

async function tableExists(client, table) {
  const q = `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`;
  const r = await client.query(q, [table]);
  return r.rowCount > 0;
}

async function backfill() {
  const client = await pool.connect();
  try {
    console.log('🔄 Starting user_lifecycle backfill...');

    const hasUsers = await tableExists(client, 'users');
    if (!hasUsers) throw new Error('users table not found');

    const hasLifetimeUsage = await tableExists(client, 'lifetime_call_usage');
    const hasDeviceSessions = await tableExists(client, 'device_speaking_sessions');

    const hasOnboardingCompleted = await columnExists(client, 'users', 'onboarding_completed');
    const hasCallCompleted = await columnExists(client, 'users', 'call_completed');
    const hasReportCompleted = await columnExists(client, 'users', 'report_completed');
    const hasOnboardingTestUsed = await columnExists(client, 'users', 'onboarding_test_call_used');

    // Fetch all users
    const usersRes = await client.query('SELECT id FROM users');
    const userIds = usersRes.rows.map(r => r.id);

    let processed = 0;
    for (const userId of userIds) {
      // Aggregate lifetime seconds
      let lifetimeSeconds = 0;
      if (hasLifetimeUsage) {
        const r = await client.query(
          `SELECT COALESCE(SUM(duration_seconds), 0) AS total FROM lifetime_call_usage WHERE user_id = $1`,
          [userId]
        );
        lifetimeSeconds = parseInt(r.rows[0]?.total || 0, 10);
      } else if (hasDeviceSessions) {
        const r = await client.query(
          `SELECT COALESCE(SUM(duration_seconds), 0) AS total FROM device_speaking_sessions WHERE user_id = $1`,
          [userId]
        );
        lifetimeSeconds = parseInt(r.rows[0]?.total || 0, 10);
      }

      // Read boolean flags from users if columns exist
      const cols = [];
      const vals = [];
      if (hasOnboardingCompleted) cols.push('onboarding_completed');
      if (hasCallCompleted) cols.push('call_completed');
      if (hasReportCompleted) cols.push('report_completed');
      if (hasOnboardingTestUsed) cols.push('onboarding_test_call_used');

      let flags = { onboarding_completed: false, call_completed: false, report_completed: false, onboarding_test_call_used: false };
      if (cols.length) {
        const r = await client.query(
          `SELECT ${cols.join(', ')} FROM users WHERE id = $1`,
          [userId]
        );
        if (r.rows[0]) {
          flags = { ...flags, ...r.rows[0] };
        }
      }

      // Upsert into user_lifecycle
      await client.query(
        `INSERT INTO user_lifecycle (
            user_id, onboarding_completed, onboarding_test_call_used, call_completed, report_completed, lifetime_call_seconds, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
            onboarding_completed = EXCLUDED.onboarding_completed,
            onboarding_test_call_used = EXCLUDED.onboarding_test_call_used,
            call_completed = EXCLUDED.call_completed,
            report_completed = EXCLUDED.report_completed,
            lifetime_call_seconds = EXCLUDED.lifetime_call_seconds,
            updated_at = NOW()`,
        [
          userId,
          !!flags.onboarding_completed,
          !!flags.onboarding_test_call_used,
          !!flags.call_completed,
          !!flags.report_completed,
          lifetimeSeconds,
        ]
      );

      processed++;
      if (processed % 100 === 0) console.log(`...processed ${processed}/${userIds.length}`);
    }

    console.log(`✅ Backfill completed for ${processed} users.`);
  } catch (err) {
    console.error('❌ Backfill error:', err);
    process.exitCode = 1;
  } finally {
    try { client.release(); } catch {}
    // Let process exit naturally to avoid pool termination races
  }
}

backfill();
