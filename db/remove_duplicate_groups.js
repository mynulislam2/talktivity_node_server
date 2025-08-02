const { Pool } = require('pg');

const pool = new Pool({
  host: 'dpg-d1giokqli9vc73an51vg-a.singapore-postgres.render.com',
  port: 5432,
  user: 'talktivity',
  password: 'gYmROfudwrUt7HJwRiNgYchzlytxCx5q',
  database: 'talktivity_postgres_sql',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 1
});

const removeDuplicateGroups = async () => {
  let client;
  try {
    console.log('🔄 Connecting to database...');
    client = await pool.connect();
    console.log('✅ Connected successfully');
    
    console.log('🔄 Starting duplicate groups cleanup...');

    // First, let's see what duplicates we have
    const duplicatesQuery = `
      SELECT name, COUNT(*) as count, array_agg(id ORDER BY id) as ids
      FROM groups 
      GROUP BY name 
      HAVING COUNT(*) > 1
      ORDER BY name;
    `;

    console.log('📋 Checking for duplicate groups...');
    const duplicatesResult = await client.query(duplicatesQuery);
    
    if (duplicatesResult.rows.length === 0) {
      console.log('✅ No duplicate groups found!');
      return;
    }

    console.log('📋 Found duplicate groups:');
    duplicatesResult.rows.forEach(row => {
      console.log(`  - ${row.name}: ${row.count} duplicates (IDs: ${row.ids.join(', ')})`);
    });

    // For each duplicate group, keep the first one (lowest ID) and delete the rest
    for (const duplicate of duplicatesResult.rows) {
      const groupName = duplicate.name;
      const ids = duplicate.ids;
      const keepId = ids[0]; // Keep the first (lowest) ID
      const deleteIds = ids.slice(1); // Delete the rest

      console.log(`\n🔄 Processing "${groupName}":`);
      console.log(`  - Keeping ID: ${keepId}`);
      console.log(`  - Deleting IDs: ${deleteIds.join(', ')}`);

      // Delete duplicate groups
      const deleteQuery = `
        DELETE FROM groups 
        WHERE id = ANY($1)
      `;
      
      const deleteResult = await client.query(deleteQuery, [deleteIds]);
      console.log(`  ✅ Deleted ${deleteResult.rowCount} duplicate groups`);
    }

    // Verify the cleanup
    const finalCheckQuery = `
      SELECT name, COUNT(*) as count
      FROM groups 
      GROUP BY name 
      HAVING COUNT(*) > 1
    `;

    const finalCheckResult = await client.query(finalCheckQuery);
    
    if (finalCheckResult.rows.length === 0) {
      console.log('\n✅ Duplicate groups cleanup completed successfully!');
      
      // Show final groups
      const finalGroupsQuery = `
        SELECT id, name, description, category, created_at
        FROM groups 
        ORDER BY name, id
      `;
      
      const finalGroupsResult = await client.query(finalGroupsQuery);
      console.log('\n📋 Final groups list:');
      finalGroupsResult.rows.forEach(group => {
        console.log(`  - ID ${group.id}: ${group.name} (${group.category})`);
      });
    } else {
      console.log('\n❌ Some duplicates still remain:', finalCheckResult.rows);
    }

  } catch (error) {
    console.error('❌ Error removing duplicate groups:', error.message);
    console.error('Error details:', error.stack);
    throw error;
  } finally {
    if (client) {
      console.log('🔄 Releasing database connection...');
      client.release();
    }
    console.log('🔄 Closing database pool...');
    await pool.end();
  }
};

// Run the cleanup
console.log('🚀 Starting duplicate groups removal script...');
removeDuplicateGroups()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }); 