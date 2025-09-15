// test-routes.js
// Test script to verify all routes are working correctly

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:8082';
const TEST_USER = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  fullName: 'Test User'
};

let authToken = null;
let userId = null;

// Test function
const testRoute = async (method, url, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      ...(data && { data })
    };

    const response = await axios(config);
    console.log(`✅ ${method} ${url} - Status: ${response.status}`);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.log(`❌ ${method} ${url} - Status: ${error.response.status}`);
      console.log(`   Error: ${error.response.data.error || error.response.data.message || 'Unknown error'}`);
    } else {
      console.log(`❌ ${method} ${url} - Network Error: ${error.message}`);
    }
    return null;
  }
};

// Run tests
const runTests = async () => {
  console.log('🧪 Starting route tests...\n');

  // 1. Health check
  await testRoute('GET', '/health');

  // 2. Authentication tests
  console.log('\n🔐 Authentication Tests:');
  
  // Register
  const registerResponse = await testRoute('POST', '/api/auth/register', TEST_USER);
  
  // Login
  const loginResponse = await testRoute('POST', '/api/auth/login', {
    email: TEST_USER.email,
    password: TEST_USER.password
  });

  if (loginResponse && loginResponse.token) {
    authToken = loginResponse.token;
    userId = loginResponse.user.id;
    console.log('✅ Authentication successful');
  } else {
    console.log('❌ Authentication failed');
    return;
  }

  // Get profile
  await testRoute('GET', '/api/auth/profile', null, { Authorization: `Bearer ${authToken}` });

  // 3. Topics tests
  console.log('\n📚 Topics Tests:');
  await testRoute('GET', '/api/topics', null, { Authorization: `Bearer ${authToken}` });

  // 4. Listening tests
  console.log('\n🎧 Listening Tests:');
  await testRoute('GET', '/api/listening/topics', null, { Authorization: `Bearer ${authToken}` });
  await testRoute('GET', '/api/listening/course/status', null, { Authorization: `Bearer ${authToken}` });

  // 5. Reports tests
  console.log('\n📊 Reports Tests:');
  const today = new Date().toISOString().split('T')[0];
  await testRoute('GET', `/api/reports/${userId}/${today}`, null, { Authorization: `Bearer ${authToken}` });

  // 6. Quiz tests
  console.log('\n❓ Quiz Tests:');
  await testRoute('POST', '/api/quiz/generate-quiz-with-attempts', {}, { Authorization: `Bearer ${authToken}` });

  // 7. Other module tests
  console.log('\n📋 Other Module Tests:');
  await testRoute('GET', '/api/transcripts/users/1/latest-conversations', null, { Authorization: `Bearer ${authToken}` });
  await testRoute('GET', '/api/leaderboard/global', null, { Authorization: `Bearer ${authToken}` });

  console.log('\n🏁 Test completed!');
};

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testRoute, runTests };