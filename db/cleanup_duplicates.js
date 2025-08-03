const { pool } = require('./index.js');

const cleanupDuplicateGroups = async () => {
  let client;
  try {
    console.log('🔄 Connecting to database using existing connection...');
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

    // Remove duplicate groups using a more efficient approach
    const deleteQuery = `
      DELETE FROM groups 
      WHERE id IN (
          SELECT id FROM (
              SELECT id,
                     ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) as rn
              FROM groups
          ) t
          WHERE t.rn > 1
      );
    `;
    
    console.log('🔄 Removing duplicate groups...');
    const deleteResult = await client.query(deleteQuery);
    console.log(`✅ Deleted ${deleteResult.rowCount} duplicate groups`);

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
  }
};

// Run the cleanup
console.log('🚀 Starting duplicate groups removal script...');
cleanupDuplicateGroups()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }); 