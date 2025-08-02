const axios = require('axios');

// Test personalized course generation
async function testPersonalizedCourseGeneration() {
  try {
    console.log('🧪 Testing personalized course generation...');
    
    // Test the course initialization endpoint
    const response = await axios.post('https://talktivity-node-server-smvz.onrender.com/api/courses/initialize', {}, {
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success) {
      console.log('✅ Course initialization successful');
      console.log('📊 Personalized topics count:', response.data.data.personalizedTopicsCount);
      
      if (response.data.data.personalizedTopicsCount > 0) {
        console.log('🎉 Personalized course generated successfully!');
        console.log('📝 Sample topics:');
        // The topics would be in the database now
      } else {
        console.log('⚠️ No personalized topics generated - this might be because:');
        console.log('   - No onboarding data found');
        console.log('   - No conversation history found');
        console.log('   - Groq API key not configured');
      }
    } else {
      console.log('❌ Course initialization failed:', response.data.error);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Test course status endpoint
async function testCourseStatus() {
  try {
    console.log('\n🧪 Testing course status...');
    
    const response = await axios.get('https://talktivity-node-server-smvz.onrender.com/api/courses/status', {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    if (response.data.success) {
      console.log('✅ Course status retrieved successfully');
      const course = response.data.data.course;
      console.log('📅 Current week:', course.currentWeek);
      console.log('📅 Current day:', course.currentDay);
      console.log('📅 Day type:', course.dayType);
      
      if (course.todayTopic) {
        console.log('🎯 Today\'s personalized topic:', course.todayTopic.title);
        console.log('📝 Topic prompt:', course.todayTopic.prompt.substring(0, 100) + '...');
      } else {
        console.log('⚠️ No personalized topic for today');
      }
    } else {
      console.log('❌ Course status failed:', response.data.error);
    }
    
  } catch (error) {
    console.error('❌ Course status test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting personalized course tests...\n');
  
  await testPersonalizedCourseGeneration();
  await testCourseStatus();
  
  console.log('\n✅ Tests completed');
}

runTests(); 