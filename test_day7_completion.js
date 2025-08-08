const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://talktivity-node-server-smvz.onrender.com';
const TEST_USER_ID = 1; // Replace with actual test user ID

async function testBatchCompletion() {
  try {
    console.log('🧪 Testing batch completion and batch generation logic...\n');

    // Step 1: Get current course status
    console.log('1️⃣ Getting current course status...');
    const statusResponse = await axios.get(`${BASE_URL}/api/courses/status`, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
      }
    });
    
    const courseStatus = statusResponse.data.data;
    console.log(`   Current Week: ${courseStatus.course.currentWeek}`);
    console.log(`   Current Day: ${courseStatus.course.currentDay}`);
    console.log(`   Batch Number: ${courseStatus.course.batchNumber}`);
    console.log(`   Batch Status: ${JSON.stringify(courseStatus.course.batchStatus)}`);

    // Step 2: Simulate batch completion by calling completion endpoints
    console.log('\n2️⃣ Simulating batch completion...');
    
    // First, let's check if we need to complete any activities for today
    const today = courseStatus.today;
    console.log(`   Today's progress:`, {
      speakingCompleted: today.progress?.speaking_completed,
      quizCompleted: today.progress?.quiz_completed,
      listeningCompleted: today.progress?.listening_completed,
      listeningQuizCompleted: today.progress?.listening_quiz_completed
    });

    // Simulate completing the remaining activities for today
    if (!today.progress?.speaking_completed) {
      console.log('   Completing speaking session...');
      await axios.post(`${BASE_URL}/api/courses/speaking/end`, {}, {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
        }
      });
    }

    if (!today.progress?.quiz_completed) {
      console.log('   Completing quiz...');
      await axios.post(`${BASE_URL}/api/courses/quiz/complete`, {
        score: 85
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
        }
      });
    }

    if (!today.progress?.listening_completed) {
      console.log('   Completing listening...');
      await axios.post(`${BASE_URL}/api/courses/listening/complete`, {}, {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
        }
      });
    }

    if (!today.progress?.listening_quiz_completed) {
      console.log('   Completing listening quiz...');
      await axios.post(`${BASE_URL}/api/courses/listening-quiz/complete`, {
        score: 90
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
        }
      });
    }

    // Step 3: Check course status again to see if batch generation was triggered
    console.log('\n3️⃣ Checking course status after batch completion...');
    const updatedStatusResponse = await axios.get(`${BASE_URL}/api/courses/status`, {
      headers: {
        'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
      }
    });
    
    const updatedCourseStatus = updatedStatusResponse.data.data;
    console.log(`   Updated Batch Status: ${JSON.stringify(updatedCourseStatus.course.batchStatus)}`);

    // Step 4: If batch generation was triggered, test the batch generation flow
    if (updatedCourseStatus.course.batchStatus?.action === 'generate_next_batch') {
      console.log('\n4️⃣ Testing batch generation flow...');
      
      console.log('   Generating next batch...');
      const generateResponse = await axios.post(`${BASE_URL}/api/courses/generate-next-batch`, {}, {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
        }
      });
      
      console.log(`   Batch generation response:`, generateResponse.data);

      // Check status again to see if batch is ready for activation
      const finalStatusResponse = await axios.get(`${BASE_URL}/api/courses/status`, {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
        }
      });
      
      const finalCourseStatus = finalStatusResponse.data.data;
      console.log(`   Final Batch Status: ${JSON.stringify(finalCourseStatus.course.batchStatus)}`);

      if (finalCourseStatus.course.batchStatus?.action === 'activate_next_batch') {
        console.log('\n5️⃣ Testing batch activation...');
        
        const activateResponse = await axios.post(`${BASE_URL}/api/courses/activate-next-batch`, {}, {
          headers: {
            'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
          }
        });
        
        console.log(`   Batch activation response:`, activateResponse.data);
      }
    }

    console.log('\n✅ Batch completion test completed successfully!');

  } catch (error) {
    console.error('❌ Error during batch completion test:', error.response?.data || error.message);
  }
}

// Run the test
testBatchCompletion()
  .then(() => {
    console.log('\n🎉 Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });

