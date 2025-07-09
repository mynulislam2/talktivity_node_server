const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5433'),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '1234',
  database: process.env.PG_DATABASE || 'postgres',
});

async function clearActiveCourses() {
  let client;
  try {
    client = await pool.connect();
    console.log('🔄 Clearing all active courses...');

    // First, let's see how many active courses exist
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM user_courses WHERE is_active = true'
    );
    const activeCourseCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Found ${activeCourseCount} active courses`);

    if (activeCourseCount === 0) {
      console.log('✅ No active courses to clear');
      return;
    }

    // Show which users have active courses
    const activeCoursesResult = await client.query(`
      SELECT uc.id, uc.user_id, u.email, uc.course_start_date, uc.personalized_topics
      FROM user_courses uc
      JOIN users u ON uc.user_id = u.id
      WHERE uc.is_active = true
      ORDER BY uc.user_id
    `);

    console.log('\n📋 Users with active courses:');
    activeCoursesResult.rows.forEach(row => {
      const hasPersonalizedTopics = row.personalized_topics && row.personalized_topics.length > 0;
      console.log(`  - User ${row.user_id} (${row.email}): Course ID ${row.id}${hasPersonalizedTopics ? ' - Has personalized topics' : ' - No personalized topics'}`);
    });

    // Clear all active courses
    const deleteResult = await client.query(
      'DELETE FROM user_courses WHERE is_active = true'
    );

    console.log(`\n✅ Successfully cleared ${deleteResult.rowCount} active courses`);
    console.log('🎉 All users can now initialize personalized courses!');

    // Also clear related data
    console.log('\n🧹 Cleaning up related data...');
    
    // Clear daily progress (since courses are deleted)
    const progressResult = await client.query('DELETE FROM daily_progress');
    console.log(`  - Cleared ${progressResult.rowCount} daily progress records`);
    
    // Clear weekly exams
    const examResult = await client.query('DELETE FROM weekly_exams');
    console.log(`  - Cleared ${examResult.rowCount} weekly exam records`);
    
    // Clear speaking sessions
    const sessionResult = await client.query('DELETE FROM speaking_sessions');
    console.log(`  - Cleared ${sessionResult.rowCount} speaking session records`);

    console.log('\n🎯 Next steps:');
    console.log('1. Users should log out and log back in');
    console.log('2. The frontend will automatically initialize personalized courses');
    console.log('3. Check the home page for course initialization messages');

  } catch (error) {
    console.error('❌ Error clearing active courses:', error);
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Run the function
clearActiveCourses().catch(console.error); 