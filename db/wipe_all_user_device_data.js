require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '1234',
  database: process.env.PG_DATABASE || 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function wipeAllUserDeviceData() {
  let client;
  try {
    client = await pool.connect();
    console.log('🗑️ Starting to wipe all user and device data...');
    console.log('⚠️  WARNING: This will delete ALL user-specific and device-specific data!');
    console.log('✅ Topics and groups will be preserved.');
    
    // Start transaction
    await client.query('BEGIN');
    
    // Tables to delete from (in order to avoid foreign key constraints)
    const tablesToWipe = [
      // User-specific data (delete in dependency order)
      'speaking_sessions',
      'weekly_exams', 
      'daily_progress',
      'user_courses',
      'user_oauth_providers',
      'user_sessions',
      'conversations',
      'onboarding_data',
      
      // Group/DM user-specific data
      'last_read_at',
      'muted_groups',
      'dm_messages',
      'dm_participants',
      'group_messages',
      'group_members',
      'dms',
      
      // Users table (delete last)
      'users'
    ];
    
    let totalDeleted = 0;
    
    for (const table of tablesToWipe) {
      try {
        console.log(`🧹 Cleaning table: ${table}...`);
        const result = await client.query(`DELETE FROM ${table}`);
        console.log(`   ✅ Deleted ${result.rowCount} rows from ${table}`);
        totalDeleted += result.rowCount;
      } catch (error) {
        console.log(`   ⚠️  Table ${table} not found or error: ${error.message}`);
      }
    }
    
    // Commit the transaction
    await client.query('COMMIT');
    
    console.log('\n🎉 Data wipe completed successfully!');
    console.log(`📊 Total rows deleted: ${totalDeleted}`);
    console.log('\n✅ PRESERVED (not deleted):');
    console.log('   - topic_categories (shared topics)');
    console.log('   - groups (shared groups)');
    console.log('   - All predefined/seed data');
    
    console.log('\n🗑️ DELETED:');
    console.log('   - All users and their accounts');
    console.log('   - All device-specific data (onboarding_data)');
    console.log('   - All user courses and progress');
    console.log('   - All speaking sessions and exam results');
    console.log('   - All conversations and transcripts');
    console.log('   - All group memberships and messages');
    console.log('   - All direct messages');
    console.log('   - All user sessions and OAuth data');
    
    return totalDeleted;
    
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('🔄 Transaction rolled back due to error');
      } catch (rollbackError) {
        console.error('❌ Error during rollback:', rollbackError.message);
      }
    }
    console.error('❌ Error wiping user/device data:', error.message);
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Confirmation prompt
function confirmWipe() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('\n⚠️  ARE YOU SURE you want to delete ALL user and device data?\nThis action cannot be undone!\n\nType "YES" to confirm: ', (answer) => {
      rl.close();
      resolve(answer.trim().toUpperCase() === 'YES');
    });
  });
}

// Main execution
if (require.main === module) {
  (async () => {
    try {
      const confirmed = await confirmWipe();
      
      if (!confirmed) {
        console.log('❌ Operation cancelled by user');
        process.exit(0);
      }
      
      console.log('\n🚀 Starting data wipe...');
      const deletedCount = await wipeAllUserDeviceData();
      console.log(`\n✅ Successfully deleted ${deletedCount} total rows of user/device data`);
      
    } catch (error) {
      console.error('❌ Failed to wipe data:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { wipeAllUserDeviceData }; 