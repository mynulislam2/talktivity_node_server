const { pool } = require('./db/index');

async function test() {
    try {
        console.log(`Checking device_conversations...`);

        const result = await pool.query(`
            SELECT id, room_name, device_id, timestamp
            FROM device_conversations 
            ORDER BY timestamp DESC
            LIMIT 10
        `);

        console.log('Device Conversations:');
        result.rows.forEach(row => {
            console.log(`ID: ${row.id}, Room: ${row.room_name}, Device: ${row.device_id}, TS: ${row.timestamp}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

test();
