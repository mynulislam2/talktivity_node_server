const { pool } = require('./db/index');

async function test() {
    try {
        const userId = 111; // Using the test user ID from before
        const date = '2026-01-19';

        console.log(`Checking conversations for user ${userId} on date ${date}...`);

        const result = await pool.query(`
            SELECT id, timestamp, DATE(timestamp) as date_part, TO_CHAR(timestamp, 'YYYY-MM-DD') as char_date
            FROM conversations 
            WHERE user_id = $1
            ORDER BY timestamp DESC
            LIMIT 5
        `, [userId]);

        console.log('Recent conversations:');
        result.rows.forEach(row => {
            console.log(`ID: ${row.id}, TS: ${row.timestamp}, DATE(): ${row.date_part}, TO_CHAR: ${row.char_date}`);
        });

        const dailyUsageResult = await pool.query(`
            SELECT * FROM daily_usage WHERE user_id = $1 ORDER BY usage_date DESC LIMIT 5
        `, [userId]);
        console.log('\nDaily Usage:');
        dailyUsageResult.rows.forEach(row => {
            console.log(`Row: ${row.usage_date} | Practice: ${row.practice_time_seconds} | Roleplay: ${row.roleplay_time_seconds}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

test();
