/**
 * Vocabulary Module Service
 * Gets vocabulary words based on user's current course week and day
 * Vocabulary is tied to specific course instances via course_id
 */

const db = require('../../core/db/client');
const { NotFoundError, ValidationError } = require('../../core/error/errors');

const vocabularyService = {
  /**
   * Get current course with week and day for user
   * Calculates from course_start_date and returns course_id
   */
  async getCurrentCourse(userId) {
    const course = await db.queryOne(
      `SELECT id, course_start_date, current_week, current_day 
       FROM user_courses 
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    if (!course) {
      throw new NotFoundError('No active course found. Please initialize your course first.');
    }

    // Calculate current week and day from course start date
    const courseStart = new Date(course.course_start_date);
    const today = new Date();
    const daysSinceStart = Math.floor((today - courseStart) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.floor(daysSinceStart / 7) + 1;
    const currentDay = (daysSinceStart % 7) + 1;

    return {
      courseId: course.id,
      week: currentWeek,
      day: currentDay
    };
  },

  /**
   * GET /words - Get vocabulary words for user's current course week/day
   * Used by: GET /api/vocabulary/words endpoint
   * Week and day come from user's active course
   */
  async getWordsForUserWeekDay(userId, week = null, day = null) {
    let weekNumber, dayNumber, courseId;

    // If week/day not provided, get from course
    if (!week || !day) {
      const course = await this.getCurrentCourse(userId);
      courseId = course.courseId;
      weekNumber = course.week;
      dayNumber = course.day;
    } else {
      // Validation if provided explicitly
      weekNumber = parseInt(week);
      dayNumber = parseInt(day);

      if (isNaN(weekNumber) || isNaN(dayNumber) || weekNumber < 1 || dayNumber < 1 || dayNumber > 7) {
        throw new ValidationError('Invalid week or day number. Week must be >= 1, day must be 1-7');
      }

      // Still get course_id for completion tracking
      const course = await this.getCurrentCourse(userId);
      courseId = course.courseId;
    }

    // Get words ordered by word_order
    // vocabulary_words table has week_number and day_number denormalized (migration 028)
    // Words are shared across all courses (same vocabulary for week/day)
    const words = await db.queryAll(
      `SELECT 
         id,
         word,
         meaning_bn,
         example_en,
         example_bn,
         word_order,
         created_at
       FROM vocabulary_words
       WHERE week_number = $1 AND day_number = $2
       ORDER BY word_order ASC, word ASC`,
      [weekNumber, dayNumber]
    );

    // If no words exist for this week/day, return error
    if (!words || words.length === 0) {
      throw new NotFoundError(`No vocabulary data found for week ${weekNumber}, day ${dayNumber}`);
    }

    // Check if vocabulary is completed for today (tied to specific course)
    const today = new Date().toISOString().split('T')[0];
    const completion = await db.queryOne(
      `SELECT id FROM vocabulary_completions 
       WHERE user_id = $1 AND course_id = $2 AND week_number = $3 AND day_number = $4 AND completed_date = $5`,
      [userId, courseId, weekNumber, dayNumber, today]
    );

    return {
      courseId,
      week: weekNumber,
      day: dayNumber,
      words,
      totalWords: words.length,
      isCompleted: !!completion
    };
  },

  /**
   * POST /complete - Mark vocabulary as completed for user's current course week/day
   * Used by: POST /api/vocabulary/complete endpoint
   * Week and day come from user's active course if not provided
   */
  async markVocabularyComplete(userId, week = null, day = null) {
    let weekNumber, dayNumber, courseId;

    // Get course info (always needed for course_id)
    const course = await this.getCurrentCourse(userId);
    courseId = course.courseId;

    // If week/day not provided, get from course
    if (!week || !day) {
      weekNumber = course.week;
      dayNumber = course.day;
    } else {
      // Validation if provided explicitly
      weekNumber = parseInt(week);
      dayNumber = parseInt(day);

      if (isNaN(weekNumber) || isNaN(dayNumber) || weekNumber < 1 || dayNumber < 1 || dayNumber > 7) {
        throw new ValidationError('Invalid week or day number. Week must be >= 1, day must be 1-7');
      }
    }

    const today = new Date().toISOString().split('T')[0];

    // Insert completion with course_id (tied to specific course)
    return await db.queryOne(
      `INSERT INTO vocabulary_completions 
       (user_id, course_id, week_number, day_number, completed_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, course_id, week_number, day_number, completed_date) 
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, course_id, week_number, day_number, completed_date, created_at, updated_at`,
      [userId, courseId, weekNumber, dayNumber, today]
    );
  },

  /**
   * Internal helper - Add vocabulary word (for admin operations)
   */
  async addVocabularyWord(wordData) {
    const { word, meaning_bn, example_en, example_bn, week_number, day_number, word_order } = wordData;

    if (!word || !meaning_bn || !week_number || !day_number) {
      throw new ValidationError('Missing required fields: word, meaning_bn, week_number, day_number');
    }

    return await db.queryOne(
      `INSERT INTO vocabulary_words 
       (word, meaning_bn, example_en, example_bn, week_number, day_number, word_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [word, meaning_bn, example_en || null, example_bn || null, week_number, day_number, word_order || 1]
    );
  },

  // ❌ REMOVED (orphaned - no active routes):
  // - getWordsForUserWeekDay (no endpoint uses this)
  // - getUserVocabularyProgress (GET /stats removed)
  // - getAllVocabularyDays (GET /list removed)
  // - getUserVocabulary (GET /list removed)
  // - markVocabularyLearned (POST /mark-learned removed)
  // - getUserVocabStats (GET /stats removed)
  // - getWeekVocabularySummary (GET /stats removed)
  //
  // Kept above methods: getWordsForWeekDay, markVocabularyComplete, addVocabularyWord
  // addVocabularyWord kept for future admin API additions
};

module.exports = vocabularyService;

