// test-api.js - Simple API endpoint test script
const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:8082/api';

async function testEndpoint(endpoint, method = 'GET', data = null) {
  try {
    console.log(`Testing ${method} ${endpoint}...`);
    const response = await axios({
      method,
      url: `${API_BASE}${endpoint}`,
      data,
      timeout: 5000
    });
    console.log(`✅ ${method} ${endpoint} - Status: ${response.status}`);
    return true;
  } catch (error) {
    console.log(`❌ ${method} ${endpoint} - Error: ${error.response?.status || error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Testing API Endpoints...\n');
  
  // Test public endpoints
  await testEndpoint('/health');
  
  // Test authentication endpoints (these will fail without tokens, but should return 401, not 500)
  await testEndpoint('/groups');
  await testEndpoint('/dms');
  await testEndpoint('/group-chat/last-read');
  await testEndpoint('/onboarding/user/1');
  
  console.log('\n✅ API endpoint tests completed!');
  console.log('Note: Authentication endpoints will return 401 without valid tokens, which is expected.');
}

runTests().catch(console.error);
