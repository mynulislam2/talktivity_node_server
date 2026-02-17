/**
 * User Lifecycle Module Service
 * Complete lifecycle state management for user journey tracking
 */

const db = require('../../core/db/client');
const { NotFoundError } = require('../../core/error/errors');

const lifecycleService = {
  /**
   * Get complete user lifecycle state
   * GET /api/lifecycle
   */
  async getLifecycleState(userId) {
    // Fetch lifecycle state
    const lifecycle = await db.queryOne(
      `SELECT 
        user_id,
        onboarding_completed,
        call_completed,
        report_completed,
        upgrade_completed,
        last_progress_check_at,
        created_at,
        updated_at
       FROM user_lifecycle 
       WHERE user_id = $1`,
      [userId]
    );

    if (!lifecycle) {
      throw new NotFoundError('User lifecycle not found');
    }

    // Fetch onboarding data - only the 15 fields we actually use (exclude legacy fields)
    const onboarding = await db.queryOne(
      `SELECT 
        skill_to_improve,
        language_statement,
        industry,
        speaking_feelings,
        speaking_frequency,
        main_goal,
        gender,
        current_learning_methods,
        current_level,
        native_language,
        known_words_1,
        known_words_2,
        interests,
        english_style,
        tutor_style,
        created_at AS onboarding_created_at,
        updated_at AS onboarding_updated_at
       FROM onboarding_data 
       WHERE user_id = $1`,
      [userId]
    );

    // Calculate steps count from onboarding_data table (single source of truth)
    let stepsCount = 0;
    if (onboarding) {
      // Count filled fields in onboarding_data (single source of truth)
      const fieldsToCheck = [
        'skill_to_improve', 'language_statement', 'industry', 'speaking_feelings',
        'speaking_frequency', 'main_goal', 'gender', 'current_learning_methods',
        'current_level', 'native_language', 'known_words_1', 'known_words_2',
        'interests', 'english_style', 'tutor_style'
      ];

      fieldsToCheck.forEach(field => {
        const value = onboarding[field];
        if (Array.isArray(value)) {
          if (value.length > 0) stepsCount++;
        } else if (value !== null && value !== undefined && value !== '') {
          stepsCount++;
        }
      });
    }

    return {
      userId: lifecycle.user_id,
      onboarding: {
        completed: lifecycle.onboarding_completed || false,
        steps: stepsCount,
        data: onboarding || null, // Full data from onboarding_data table (single source of truth)
      },
      milestones: {
        callCompleted: lifecycle.call_completed || false,
        reportCompleted: lifecycle.report_completed || false,
        upgradeCompleted: lifecycle.upgrade_completed || false,
      },
      timestamps: {
        lastProgressCheck: lifecycle.last_progress_check_at,
        createdAt: lifecycle.created_at,
        updatedAt: lifecycle.updated_at,
      },
    };
  },

  /**
   * Update user lifecycle fields (flexible update)
   * POST /api/lifecycle
   */
  async updateLifecycleState(userId, updates) {
    // onboarding_steps column has been removed from user_lifecycle
    // onboarding_data table is the single source of truth
    const allowedFields = [
      'onboarding_completed',
      'call_completed',
      'report_completed',
      'upgrade_completed',
    ];

    // Filter only allowed fields
    const fields = [];
    const values = [];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
      // Ignore any attempts to update onboarding_steps (column doesn't exist)
    }

    if (fields.length === 0) {
      return this.getLifecycleState(userId);
    }

    // Build dynamic UPDATE query
    const query = `
      UPDATE user_lifecycle 
      SET ${fields.join(', ')}, 
          last_progress_check_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `;

    const result = await db.queryOne(query, [userId, ...values]);

    if (!result) {
      // If user_lifecycle doesn't exist, create it
      return this.initializeLifecycle(userId, updates);
    }

    return this.getLifecycleState(userId);
  },

  /**
   * Initialize user lifecycle (called from auth register or first access)
   */
  async initializeLifecycle(userId, initialValues = {}) {
    // onboarding_steps column has been removed from user_lifecycle
    // onboarding_data table is the single source of truth
    const lifecycle = await db.queryOne(
      `INSERT INTO user_lifecycle (
        user_id,
        onboarding_completed,
        call_completed,
        report_completed,
        upgrade_completed,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
      RETURNING *`,
      [
        userId,
        initialValues.onboarding_completed || false,
        initialValues.call_completed || false,
        initialValues.report_completed || false,
        initialValues.upgrade_completed || false,
      ]
    );

    return this.getLifecycleState(userId);
  },

};

module.exports = lifecycleService;
