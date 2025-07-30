// Test script for listening APIs
// Usage: node test_listening_apis.js

const fetch = require('node-fetch');

const BASE_URL = 'https://talktivity-node-server-smvz.onrender.com/api';
const TEST_TOKEN = 'your-test-token-here'; // Replace with actual token

async function testListeningAPIs() {
  console.log('🧪 Testing Listening APIs...\n');

  try {
    // Test 1: Start listening session
    console.log('1️⃣ Testing /courses/listening/start...');
    const startResponse = await fetch(`${BASE_URL}/courses/listening/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });

    if (startResponse.ok) {
      const startData = await startResponse.json();
      console.log('✅ Start listening API working:', startData);
    } else {
      const errorData = await startResponse.json();
      console.log('❌ Start listening API failed:', errorData);
    }

    // Wait a bit before testing complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Complete listening
    console.log('\n2️⃣ Testing /courses/listening/complete...');
    const completeResponse = await fetch(`${BASE_URL}/courses/listening/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    });

    if (completeResponse.ok) {
      const completeData = await completeResponse.json();
      console.log('✅ Complete listening API working:', completeData);
    } else {
      const errorData = await completeResponse.json();
      console.log('❌ Complete listening API failed:', errorData);
    }

    // Test 3: Complete listening quiz
    console.log('\n3️⃣ Testing /courses/listening-quiz/complete...');
    const quizResponse = await fetch(`${BASE_URL}/courses/listening-quiz/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({ score: 85 })
    });

    if (quizResponse.ok) {
      const quizData = await quizResponse.json();
      console.log('✅ Complete listening quiz API working:', quizData);
    } else {
      const errorData = await quizResponse.json();
      console.log('❌ Complete listening quiz API failed:', errorData);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testListeningAPIs(); 