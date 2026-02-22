/**
 * Courses Module Service
 * Extracted from routes/course-routes.js (3393 lines)
 * Manages course initialization, personalization, progress tracking, and batch generation
 */

const db = require('../../core/db/client');
const axios = require('axios');
const llmService = require('../../core/llm/llmService');
const listeningTopics = require('../../../listening-topics');
const { NotFoundError, ValidationError } = require('../../core/error/errors');
const { calculateXP, calculateLevel } = require('../../../utils/xpCalc');
const { getUtcToday, toUtcMidnight, calculateCourseProgress } = require('../../utils/timezone');

const coursesService = {
  /**
   * Initialize a new 12-week course for user
   * Requires onboarding data and generates personalized topics
   */
  async initializeUserCourse(userId) {
    const client = await db.pool.connect();
    try {
      // Check if user already has an active course with personalized topics
      const existingCourse = await client.query(
        `SELECT * FROM user_courses 
         WHERE user_id = $1 AND is_active = true 
         AND personalized_topics IS NOT NULL 
         AND jsonb_array_length(personalized_topics) > 0`,
        [userId]
      );

      if (existingCourse.rows.length > 0) {
        const topics = existingCourse.rows[0].personalized_topics;
        return {
          ...existingCourse.rows[0],
          personalizedTopicsCount: Array.isArray(topics) ? topics.length : 0,
        };
      }

      // Fetch onboarding data and lifecycle data
      const [onboardingResult, lifecycleResult] = await Promise.all([
        // Get onboarding data from onboarding_data table (single source of truth)
        client.query(
          `SELECT 
            id, user_id, skill_to_improve, language_statement,
            industry, speaking_feelings, speaking_frequency,
            main_goal, gender, current_learning_methods,
            current_level, native_language, known_words_1,
            known_words_2, interests, english_style, tutor_style,
            created_at, updated_at
           FROM onboarding_data WHERE user_id = $1`,
          [userId]
        ),
        // Get lifecycle data
        client.query(
          `SELECT 
            user_id,
            onboarding_completed,
            call_completed,
            report_completed,
            upgrade_completed,
            created_at,
            updated_at
           FROM user_lifecycle WHERE user_id = $1`,
          [userId]
        )
      ]);

      // Debug logging
      console.log(`[Course Init] User ID: ${userId}`);
      console.log(`[Course Init] Onboarding data found: ${onboardingResult.rows.length > 0}`);
      console.log(`[Course Init] Lifecycle data found: ${lifecycleResult.rows.length > 0}`);

      // Validate onboarding data exists
      if (onboardingResult.rows.length === 0) {
        console.error(`[Course Init] No onboarding data found for user ${userId}`);
        throw new ValidationError('Onboarding data not found. Please complete onboarding first.');
      }

      const onboardingData = onboardingResult.rows[0];

      // Validate all onboarding fields are filled
      const requiredFields = [
        'skill_to_improve', 'language_statement', 'industry', 'speaking_feelings',
        'speaking_frequency', 'main_goal', 'gender', 'current_learning_methods',
        'current_level', 'native_language', 'known_words_1', 'known_words_2',
        'interests', 'english_style', 'tutor_style'
      ];

      const missingFields = requiredFields.filter(field => {
        const value = onboardingData[field];
        if (Array.isArray(value)) {
          return value.length === 0;
        }
        return value === null || value === undefined || value === '';
      });

      if (missingFields.length > 0) {
        throw new ValidationError(`Onboarding incomplete. Missing fields: ${missingFields.join(', ')}. Please complete onboarding first.`);
      }

      // Validate lifecycle data exists
      if (lifecycleResult.rows.length === 0) {
        throw new ValidationError('User lifecycle not found. Please complete onboarding first.');
      }

      const lifecycle = lifecycleResult.rows[0];

      // Validate all 4 lifecycle fields are completed (true)
      const lifecycleFields = [
        { name: 'onboarding_completed', label: 'Onboarding' },
        { name: 'call_completed', label: 'Call' },
        { name: 'report_completed', label: 'Report' },
        { name: 'upgrade_completed', label: 'Upgrade' }
      ];

      const incompleteLifecycleFields = lifecycleFields.filter(field => {
        return lifecycle[field.name] !== true;
      });

      if (incompleteLifecycleFields.length > 0) {
        const incompleteLabels = incompleteLifecycleFields.map(f => f.label).join(', ');
        throw new ValidationError(`Lifecycle incomplete. Please complete: ${incompleteLabels}.`);
      }

      // Deactivate all previous active courses
      await client.query(
        'UPDATE user_courses SET is_active = false WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      // Remove any course with no personalized topics (cleanup)
      await client.query(
        `DELETE FROM user_courses WHERE user_id = $1 AND (personalized_topics IS NULL OR jsonb_array_length(personalized_topics) = 0)`,
        [userId]
      );

      // Use UTC dates for course start/end
      const startDate = new Date(getUtcToday() + 'T00:00:00.000Z');
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 84); // 12 weeks * 7 days

      const conversationResult = await client.query(
        'SELECT transcript FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5',
        [userId]
      );

      const conversations = conversationResult.rows.map(row => row.transcript);

      let personalizedTopics = [];
      try {
        personalizedTopics = await this.generatePersonalizedCourse(onboardingData, conversations);
        console.log('Personalized course generated with', personalizedTopics.length, 'topics');
      } catch (error) {
        console.error('Error generating personalized course:', error);
        throw new ValidationError('Failed to generate personalized course. Please complete onboarding and try again.');
      }

      if (!personalizedTopics || personalizedTopics.length === 0) {
        throw new ValidationError('Personalized topics could not be generated. Please retry after completing onboarding.');
      }

      // Create new course with personalized topics
      const result = await client.query(
        `INSERT INTO user_courses (user_id, course_start_date, course_end_date, current_week, current_day, is_active, personalized_topics)
         VALUES ($1, $2, $3, 1, 1, true, $4)
         RETURNING *`,
        [userId, startDate, endDate, JSON.stringify(personalizedTopics)]
      );

      console.log('Course created successfully:', result.rows[0].id);
      return {
        ...result.rows[0],
        personalizedTopicsCount: personalizedTopics.length,
      };
    } finally {
      client.release();
    }
  },

  /**
   * Get current course status and today's progress
   */
  async getCourseStatus(userId) {
    const client = await db.pool.connect();
    try {
      const today = getUtcToday();

      const courseResult = await client.query(
        'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      if (courseResult.rows.length === 0) {
        throw new NotFoundError('No active course found');
      }

      const course = courseResult.rows[0];

      const progressResult = await client.query(
        'SELECT * FROM daily_progress WHERE user_id = $1 AND progress_date = $2',
        [userId, today]
      );

      const todayProgress = progressResult.rows[0] || null;

      // Calculate current week and day (normalize dates to avoid timezone issues)
      // today is already declared above as YYYY-MM-DD string
      const todayStr = today; // Reuse the existing today variable

      let courseStartStr;
      if (typeof course.course_start_date === 'string') {
        courseStartStr = course.course_start_date.split('T')[0];
      } else if (course.course_start_date instanceof Date) {
        courseStartStr = course.course_start_date.toISOString().split('T')[0];
      } else {
        courseStartStr = String(course.course_start_date).split('T')[0];
      }

      // Use the same UTC-based calculation as other services (getCourseTimeline, vocabulary, etc.)
      // This ensures consistency across all components
      const { week: currentWeek, day: currentDay } = calculateCourseProgress(courseStartStr);

      // Batch triggering moved to separate endpoint: POST /api/courses/check-and-trigger-batch

      // Get subscription for time remaining calculation
      const subscriptionResult = await client.query(
        `SELECT s.*, sp.plan_type, sp.features
         FROM subscriptions s
         JOIN subscription_plans sp ON s.plan_id = sp.id
         WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > (NOW() AT TIME ZONE 'UTC')
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [userId]
      );

      let dailyLimitSeconds = 5 * 60;
      if (subscriptionResult.rows.length > 0) {
        const subscription = subscriptionResult.rows[0];
        if (subscription.plan_type === 'Pro') {
          dailyLimitSeconds = 60 * 60;
        }
      }

      // Practice time tracked via speaking_started_at/speaking_ended_at timestamps
      // For now, set timeRemaining to 5 minutes default
      const timeRemaining = 5 * 60;

      let todayTopic = null;
      if (course.personalized_topics && course.personalized_topics.length > 0) {
        const dayIndex = (currentWeek - 1) * 7 + (currentDay - 1);
        if (dayIndex < course.personalized_topics.length) {
          todayTopic = course.personalized_topics[dayIndex];
        }
      }

      const topicIndex = (currentDay - 1) % listeningTopics.length;
      const todayListeningTopic = listeningTopics[topicIndex];


      return {
        course: {
          id: course.id,
          currentWeek,
          currentDay,
          totalWeeks: 12,
          totalDays: 84,
          batchNumber: course.batch_number || 1,
          batchStatus: course.batch_status ? {
            action: course.batch_status.action,
            message: course.batch_status.message,
            batchNumber: course.batch_status.batch_number,
          } : undefined,
          todayTopic,
          todayListeningTopic,
        },
      };
    } finally {
      client.release();
    }
  },

  /**
   * Get full 12-week course timeline with per-day progress merged from daily_progress
   * Used by: GET /api/courses/timeline?date=YYYY-MM-DD
   * If date omitted, uses PostgreSQL CURRENT_DATE
   */
  async getCourseTimeline(userId, date) {
    const client = await db.pool.connect();
    try {
      const courseResult = await client.query(
        'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      if (courseResult.rows.length === 0) {
        throw new NotFoundError('No active course found');
      }

      const course = courseResult.rows[0];
      const courseStart = new Date(course.course_start_date);

      const totalWeeks = 12;
      const totalDays = totalWeeks * 7;

      // Fetch all daily_progress rows for the course window in one query
      const endDate = new Date(courseStart);
      endDate.setDate(endDate.getDate() + (totalDays - 1));
      const startISO = courseStart.toISOString().split('T')[0];
      const endISO = endDate.toISOString().split('T')[0];

      const progressRows = await client.query(
        `SELECT * FROM daily_progress
         WHERE user_id = $1
           AND progress_date::date >= $2::date
           AND progress_date::date <= $3::date`,
        [userId, startISO, endISO]
      );

      const progressByDate = new Map();
      for (const row of progressRows.rows || []) {
        // Normalize progress_date to YYYY-MM-DD string to avoid timezone issues
        let progressDateStr;
        if (typeof row.progress_date === 'string') {
          progressDateStr = row.progress_date.split('T')[0];
        } else if (row.progress_date instanceof Date) {
          progressDateStr = row.progress_date.toISOString().split('T')[0];
        } else {
          // Fallback: try to convert to string
          progressDateStr = String(row.progress_date).split('T')[0];
        }
        progressByDate.set(progressDateStr, row);
      }

      // Determine current week/day relative to today
      // Use provided date or UTC today (for consistency across all services)
      let todayISO;
      if (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        todayISO = date;
      } else {
        todayISO = getUtcToday();
      }

      // Normalize course start date to UTC midnight for accurate comparison
      let courseStartStr;
      if (typeof course.course_start_date === 'string') {
        courseStartStr = course.course_start_date.split('T')[0];
      } else if (course.course_start_date instanceof Date) {
        courseStartStr = course.course_start_date.toISOString().split('T')[0];
      } else {
        courseStartStr = String(course.course_start_date).split('T')[0];
      }

      // Calculate current week and day using the same UTC-based calculation as getCourseStatus
      // This ensures consistency across all components
      const { week: calculatedWeek, day: calculatedDay } = calculateCourseProgress(courseStartStr);
      let currentWeek = calculatedWeek;
      let currentDay = calculatedDay;

      // Helper: day type schedule
      const getDayType = (dayNumber) => {
        // Days 1–6: full activity days (speaking + quiz + listening + listening quiz)
        // Day 7: speaking exam day (still uses speaking/speaking_quiz flags from daily_progress)
        if (dayNumber === 7) return 'speaking_exam';
        return 'all_activities';
      };

      const isDayCompleted = (dayType, progress) => {
        if (!progress) return false;
        if (dayType === 'all_activities') {
          return (
            progress.speaking_completed === true &&
            progress.speaking_quiz_completed === true &&
            progress.listening_completed === true &&
            progress.listening_quiz_completed === true
          );
        }
        if (dayType === 'speaking_exam') {
          // Exam day is considered complete when both speaking and quiz are completed for that day.
          return (
            progress.speaking_completed === true &&
            progress.speaking_quiz_completed === true
          );
        }
        return false;
      };

      // Build full timeline
      const timeline = [];
      let completedDays = 0;

      for (let dayIndex = 0; dayIndex < totalDays; dayIndex++) {
        // Calculate date by adding days to courseStartStr (YYYY-MM-DD) to avoid timezone issues
        // Parse as UTC midnight, add days, then convert back to YYYY-MM-DD
        const courseStartUTC = new Date(courseStartStr + 'T00:00:00.000Z');
        const targetDateUTC = new Date(courseStartUTC);
        targetDateUTC.setUTCDate(targetDateUTC.getUTCDate() + dayIndex);
        const dateISO = targetDateUTC.toISOString().split('T')[0];

        // Use the same calculation as calculateCourseProgress for consistency
        // dayIndex represents days since start (0 = first day, 1 = second day, etc.)
        const week = Math.floor(dayIndex / 7) + 1;
        const day = (dayIndex % 7) + 1;
        const dayType = getDayType(day);

        const progress = progressByDate.get(dateISO) || null;
        const completed = isDayCompleted(dayType, progress);
        if (completed) completedDays += 1;

        // Determine if this is the current day by matching the date
        const isCurrentDay = dateISO === todayISO;
        const isPast = dateISO < todayISO;

        // For the current day, use the calculated currentWeek and currentDay to ensure consistency
        // with getCourseStatus. For other days, use the dayIndex-based calculation.
        const finalWeek = isCurrentDay ? currentWeek : week;
        const finalDay = isCurrentDay ? currentDay : day;

        // Personalized speaking topic (aligned to the day index)
        let personalizedTopic = null;
        if (course.personalized_topics && course.personalized_topics.length > 0) {
          if (dayIndex < course.personalized_topics.length) {
            personalizedTopic = course.personalized_topics[dayIndex];
          }
        }

        timeline.push({
          week: finalWeek,
          day: finalDay,
          dayIndex,
          date: dateISO,
          dayType,
          isCompleted: completed,
          isCurrentDay,
          isPast,
          personalizedTopic,
          progress: progress
            ? {
              speaking_duration_seconds: progress.speaking_duration_seconds || 0,
            }
            : undefined,
        });
      }

      const progressPercent = Math.round((completedDays / totalDays) * 100);

      // If no day matched todayISO (course hasn't started yet or is in the future),
      // use calculateCourseProgress as fallback to ensure consistency with getCourseStatus
      if (currentWeek === 1 && currentDay === 1 && timeline.length > 0) {
        const { week, day } = calculateCourseProgress(courseStartStr);
        currentWeek = week;
        currentDay = day;
      }

      return {
        timeline,
        course: {
          totalWeeks,
          currentWeek,
          progress: progressPercent,
        },
      };
    } finally {
      client.release();
    }
  },

  /**
   * Generate personalized course using Groq AI
   * @param {object} onboardingData - User onboarding preferences
   * @param {array} conversations - Recent transcripts for context
   * @param {array} excludedTopics - Topic titles to NOT generate (already completed)
   */
  async generatePersonalizedCourse(onboardingData, conversations, excludedTopics = []) {
    const contextOnboarding = {
      skill_to_improve: onboardingData.skill_to_improve,
      current_level: onboardingData.current_level,
      native_language: onboardingData.native_language,
      industry: onboardingData.industry,
      interests: onboardingData.interests,
      main_goal: onboardingData.main_goal,
      speaking_feelings: onboardingData.speaking_feelings,
      speaking_frequency: onboardingData.speaking_frequency,
      current_learning_methods: onboardingData.current_learning_methods,
      known_words_1: onboardingData.known_words_1,
      known_words_2: onboardingData.known_words_2,
      english_style: onboardingData.english_style,
      tutor_style: onboardingData.tutor_style,
    };

    const topics = await llmService.generateCoursePlan(contextOnboarding, conversations, excludedTopics);
    if (!Array.isArray(topics) || topics.length !== 7) {
      throw new ValidationError('AI did not return a valid 7-topic course plan');
    }
    return topics;
  },

  /**
   * Check if course is about to finish current week and generate next batch
   * POST /api/courses/check-and-create-next-batch
   */
  async checkAndCreateNextBatch(userId) {
    const courseResult = await this._getCourseIfExists(userId);
    if (!courseResult) {
      throw new NotFoundError('No active course found');
    }

    const course = courseResult;

    // Normalize course_start_date to YYYY-MM-DD string for consistent calculation
    let courseStartStr;
    if (typeof course.course_start_date === 'string') {
      courseStartStr = course.course_start_date.split('T')[0];
    } else if (course.course_start_date instanceof Date) {
      courseStartStr = course.course_start_date.toISOString().split('T')[0];
    } else {
      courseStartStr = String(course.course_start_date).split('T')[0];
    }

    // Calculate current week and day using UTC helper (consistent, no timezone issues)
    const { week: currentWeek, day: currentDay } = calculateCourseProgress(courseStartStr);

    const TOTAL_COURSE_WEEKS = 12;
    const isFirstDayOfNewWeek = currentDay === 1 && currentWeek > 1;
    const batchNumber = course.batch_number || 1;
    const isBatchBehind = batchNumber < currentWeek;

    // If it's the first day of a new week OR batch is behind current week, generate next batch
    if ((isFirstDayOfNewWeek || isBatchBehind) && currentWeek < TOTAL_COURSE_WEEKS) {
      console.log(
        `[Batch] Triggering batch generation. isFirstDayOfNewWeek: ${isFirstDayOfNewWeek}, ` +
        `isBatchBehind: ${isBatchBehind} (batchNumber: ${batchNumber}, currentWeek: ${currentWeek})`
      );
      return await this.generateNextBatch(userId);
    }

    // If final week reached, return completion message
    if (currentWeek >= TOTAL_COURSE_WEEKS) {
      return {
        success: true,
        message: 'Congratulations! You have completed the full 3-month course!',
        currentWeek,
        currentDay,
      };
    }

    // Otherwise, no batch action needed yet
    console.log(
      `[Batch] No action needed. batchNumber: ${batchNumber}, currentWeek: ${currentWeek}, ` +
      `currentDay: ${currentDay}, isFirstDayOfNewWeek: ${isFirstDayOfNewWeek}`
    );
    return {
      success: true,
      message: 'No batch action needed at this time',
      currentWeek,
      currentDay,
      batchNumber,
      isBatchBehind,
      nextBatchTriggerDay: (7 - currentDay) + 1,
    };
  },

  /**
   * Helper: Get active course or null
   */
  async _getCourseIfExists(userId) {
    const client = await db.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  },

  /**
   * Generate next batch of 7 topics (called on first day of new week)
   * Filters out completed topics to avoid duplicates
   */
  async generateNextBatch(userId) {
    const client = await db.pool.connect();
    try {
      // Get current course
      const courseResult = await client.query(
        'SELECT * FROM user_courses WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      if (courseResult.rows.length === 0) {
        throw new NotFoundError('No active course found');
      }

      const course = courseResult.rows[0];
      const currentTopics = course.personalized_topics || [];

      // Extract completed topic titles to avoid duplicates
      const completedTopicTitles = currentTopics.map(t => t.title);
      console.log(
        `[Batch] User has ${completedTopicTitles.length} completed topics:`,
        completedTopicTitles.slice(0, 5).join(', ') + 
        (completedTopicTitles.length > 5 ? '...' : '')
      );

      // Get onboarding data
      const onboardingResult = await client.query(
        `SELECT 
          id, user_id, skill_to_improve, language_statement,
          industry, speaking_feelings, speaking_frequency,
          main_goal, gender, current_learning_methods,
          current_level, native_language, known_words_1,
          known_words_2, interests, english_style, tutor_style,
          created_at, updated_at
         FROM onboarding_data WHERE user_id = $1`,
        [userId]
      );

      if (onboardingResult.rows.length === 0) {
        throw new ValidationError('Onboarding data not found');
      }

      const onboardingData = onboardingResult.rows[0];

      // Get latest conversations for context
      const conversationResult = await client.query(
        'SELECT transcript FROM conversations WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 5',
        [userId]
      );

      const conversations = conversationResult.rows.map(row => row.transcript);

      // Generate next batch with excluded topics
      let newTopics = [];
      try {
        newTopics = await this.generatePersonalizedCourse(
          onboardingData, 
          conversations,
          completedTopicTitles
        );
        console.log('Next batch generated with', newTopics.length, 'new topics');
      } catch (error) {
        console.error('Error generating next batch:', error);
        throw new ValidationError(`Failed to generate next batch: ${error.message}`);
      }

      // Validate LLM response before storing
      if (!Array.isArray(newTopics)) {
        throw new ValidationError(
          `Expected array of topics, got ${typeof newTopics}`
        );
      }

      if (newTopics.length === 0) {
        throw new ValidationError('LLM returned empty array');
      }

      if (newTopics.length !== 7) {
        console.warn(
          `[Batch] Warning: LLM returned ${newTopics.length} topics (expected 7)`
        );
        if (newTopics.length < 3) {
          throw new ValidationError(
            `Too few topics: ${newTopics.length} (minimum 3 required)`
          );
        }
      }

      // Validate each topic has required fields
      const requiredFields = ['id', 'title', 'prompt', 'firstPrompt'];
      const newTopicTitles = [];

      for (let i = 0; i < newTopics.length; i++) {
        const topic = newTopics[i];

        if (!topic || typeof topic !== 'object') {
          throw new ValidationError(`Topic ${i + 1} is not a valid object`);
        }

        for (const field of requiredFields) {
          if (!topic[field]) {
            throw new ValidationError(
              `Topic ${i + 1} missing required field: "${field}"`
            );
          }
          if (typeof topic[field] !== 'string') {
            throw new ValidationError(
              `Topic ${i + 1} field "${field}" must be string, got ${typeof topic[field]}`
            );
          }
          if (topic[field].trim().length === 0) {
            throw new ValidationError(
              `Topic ${i + 1} field "${field}" is empty`
            );
          }
        }

        newTopicTitles.push(topic.title);

        // Warn if LLM generated duplicate
        if (completedTopicTitles.includes(topic.title)) {
          console.warn(
            `[Batch] ⚠️  Topic "${topic.title}" already completed (possible LLM duplicate)`
          );
        }
      }

      console.log('✅ Batch validation passed. New topics:', newTopicTitles.join(', '));

      // All validations passed, safe to store
      const allTopics = [...currentTopics, ...newTopics];

      await client.query(
        'UPDATE user_courses SET personalized_topics = $1 WHERE id = $2',
        [JSON.stringify(allTopics), course.id]
      );

      console.log(
        `✅ Batch generation successful. Total topics: ${allTopics.length}`
      );

      return {
        success: true,
        message: 'Next batch generated successfully',
        newTopicsCount: newTopics.length,
        totalTopicsCount: allTopics.length,
        newTopics: newTopicTitles,
      };
    } finally {
      client.release();
    }
  },
};

module.exports = coursesService;
