const { pool } = require('./db/index');

async function test() {
    try {
        console.log(`Checking most recent conversations...`);

        const result = await pool.query(`
            SELECT id, room_name, user_id, timestamp
            FROM conversations 
            ORDER BY timestamp DESC
            LIMIT 20
        `);

        console.log('Conversations:');
        result.rows.forEach(row => {
            console.log(`ID: ${row.id}, Room: ${row.room_name}, User: ${row.user_id}, TS: ${row.timestamp}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

test();
