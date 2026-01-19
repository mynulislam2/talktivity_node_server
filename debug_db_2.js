const { pool } = require('./db/index');

async function test() {
    try {
        const userId = 111;

        console.log(`Checking all conversations for user ${userId}...`);

        const result = await pool.query(`
            SELECT id, timestamp, DATE(timestamp) as date_part
            FROM conversations 
            WHERE user_id = $1
            ORDER BY timestamp DESC
        `, [userId]);

        console.log('Conversations:');
        result.rows.forEach(row => {
            console.log(`ID: ${row.id}, TS: ${row.timestamp}, DATE(): ${row.date_part}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

test();
