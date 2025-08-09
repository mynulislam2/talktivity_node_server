const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://talktivity-node-server-smvz.onrender.com';

async function testCourseCompletion() {
  try {
    console.log('🧪 Testing course completion logic after 12 weeks...\n');

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
    console.log(`   Total Weeks: ${courseStatus.course.totalWeeks}`);
    console.log(`   Batch Status: ${JSON.stringify(courseStatus.course.batchStatus)}`);

    // Step 2: Check if we're in the final week
    const isFinalWeek = courseStatus.course.currentWeek >= 12;
    console.log(`\n2️⃣ Week ${courseStatus.course.currentWeek} of ${courseStatus.course.totalWeeks}`);
    console.log(`   Is Final Week: ${isFinalWeek}`);

    if (isFinalWeek) {
      console.log('   🎉 User is in the final week! Course will complete after Day 7');
      
      // Step 3: Simulate Day 7 completion in final week
      console.log('\n3️⃣ Simulating Day 7 completion in final week...');
      
      // Complete all activities for today
      const today = courseStatus.today;
      
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
          score: 90
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
          score: 95
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
          }
        });
      }

      // Step 4: Check course status after completion
      console.log('\n4️⃣ Checking course status after final week completion...');
      const finalStatusResponse = await axios.get(`${BASE_URL}/api/courses/status`, {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'your-test-token-here'}`
        }
      });
      
      const finalCourseStatus = finalStatusResponse.data.data;
      console.log(`   Final Batch Status: ${JSON.stringify(finalCourseStatus.course.batchStatus)}`);

      if (finalCourseStatus.course.batchStatus?.action === 'course_completed') {
        console.log('\n✅ SUCCESS: Course marked as completed!');
        console.log(`   Message: ${finalCourseStatus.course.batchStatus.message}`);
        console.log(`   Completed Week: ${finalCourseStatus.course.batchStatus.completedWeek}`);
        console.log(`   Total Weeks: ${finalCourseStatus.course.batchStatus.totalWeeks}`);
      } else {
        console.log('\n❌ Course was not marked as completed');
        console.log(`   Expected: course_completed`);
        console.log(`   Got: ${finalCourseStatus.course.batchStatus?.action}`);
      }
    } else {
      console.log('   User is not in final week yet');
      console.log(`   ${12 - courseStatus.course.currentWeek} weeks remaining`);
    }

    console.log('\n✅ Course completion test completed successfully!');

  } catch (error) {
    console.error('❌ Error during course completion test:', error.response?.data || error.message);
  }
}

// Run the test
testCourseCompletion()
  .then(() => {
    console.log('\n🎉 Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });

