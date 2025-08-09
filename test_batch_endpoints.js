const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3001'; // Adjust port if needed
const TEST_USER_ID = 1; // Replace with actual user ID for testing

// Mock authentication token (you'll need to get a real token)
const AUTH_TOKEN = 'your-auth-token-here';

async function testBatchEndpoints() {
  console.log('🧪 Testing Batch Generation Endpoints...\n');

  try {
    // Test 1: Check course status
    console.log('1. Testing course status...');
    const statusResponse = await axios.get(`${BASE_URL}/api/courses/status`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    console.log('✅ Course status:', statusResponse.data);
    console.log('   Batch status:', statusResponse.data.data?.course?.batchStatus);
    console.log('');

    // Test 2: Generate next batch (if needed)
    if (statusResponse.data.data?.course?.batchStatus?.action === 'generate_next_batch') {
      console.log('2. Generating next batch...');
      const generateResponse = await axios.post(`${BASE_URL}/api/courses/generate-next-batch`, {}, {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Next batch generated:', generateResponse.data);
      console.log('');
    } else {
      console.log('2. Skipping batch generation (not needed)');
      console.log('');
    }

    // Test 3: Check status after generation (activation removed in single-course mode)
    const updatedStatusResponse = await axios.get(`${BASE_URL}/api/courses/status`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    console.log('3. Activation step removed; current batch status:', updatedStatusResponse.data.data?.course?.batchStatus);

    // Test 4: Final status check
    console.log('4. Final course status...');
    const finalStatusResponse = await axios.get(`${BASE_URL}/api/courses/status`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });
    console.log('✅ Final course status:', finalStatusResponse.data);
    console.log('   Current batch:', finalStatusResponse.data.data?.course?.batchNumber);
    console.log('   Batch status:', finalStatusResponse.data.data?.course?.batchStatus);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Instructions for running the test
console.log('📋 Instructions:');
console.log('1. Make sure the server is running: node server.js');
console.log('2. Replace AUTH_TOKEN with a real authentication token');
console.log('3. Run this script: node test_batch_endpoints.js');
console.log('');

// Uncomment the line below to run the test
// testBatchEndpoints();

