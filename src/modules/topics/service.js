/**
 * Topics Module Service
 * Simple getters: getUserTopics and getTopicById
 */

const db = require('../../core/db/client');

const topicsService = {
  /**
   * Get all topics for user with subscription-based restrictions
   * Basic/FreeTrial: max 5 topics per category (including Custom Category)
   * Pro: unlimited topics (all topics visible)
   */
  async getUserTopics(userId) {
    // Get user's active subscription
    const subscription = await db.queryOne(
      `SELECT s.*, sp.plan_type
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId]
    );

    const isBasicOrFreeTrial = !subscription || subscription.plan_type === 'Basic' || subscription.plan_type === 'FreeTrial';

    // Get all categories
    const categories = await db.queryAll(
      `SELECT id, category_name, topics, created_at, updated_at
       FROM topic_categories
       ORDER BY created_at DESC`
    );

    // Apply restrictions based on plan
    return categories.map(category => {
      const topics = category.topics || [];
      const displayedTopics = isBasicOrFreeTrial ? topics.slice(0, 5) : topics;
      
      return {
        ...category,
        topics: displayedTopics,
        totalTopics: topics.length,
        displayedTopics: displayedTopics.length,
        planType: isBasicOrFreeTrial ? 'Basic/FreeTrial' : 'Pro',
        restricted: isBasicOrFreeTrial && topics.length > 5,
      };
    });
  },

  /**
   * Get topic by ID with full details
   */
  async getTopicById(topicId) {
    // Get all categories to find the topic
    const categories = await db.queryAll(
      `SELECT id, category_name, topics, created_at, updated_at
       FROM topic_categories
       ORDER BY created_at DESC`
    );

    // Search for topic across all categories
    for (const category of categories) {
      const topics = category.topics || [];
      const foundTopic = topics.find(t => t.id === parseInt(topicId) || t.id === topicId);
      
      if (foundTopic) {
        return {
          ...foundTopic,
          categoryId: category.id,
          categoryName: category.category_name,
          categoryCreatedAt: category.created_at,
        };
      }
    }

    // Topic not found
    throw new Error(`Topic with ID ${topicId} not found`);
  },

  /**
   * Create a custom topic for user
   * Basic/FreeTrial: max 5 custom topics total
   * Pro: unlimited custom topics
   */
  async createUserTopic(userId, categoryName, topicData) {
    // 1. Get user's subscription plan
    const subscription = await db.queryOne(
      `SELECT s.*, sp.plan_type
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE s.user_id = $1 AND s.status = 'active' AND s.end_date > NOW()
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId]
    );

    const isBasicOrFreeTrial = !subscription || subscription.plan_type === 'Basic' || subscription.plan_type === 'FreeTrial';

    // 2. Always use "Custom Category" for user-created topics (ignore categoryName parameter)
    const CUSTOM_CATEGORY_NAME = 'Custom Category';
    
    // 3. Get Custom Category (it should exist, but create if missing)
    let category = await db.queryOne(
      `SELECT id, category_name, topics, created_at, updated_at
       FROM topic_categories
       WHERE category_name = $1
       LIMIT 1`,
      [CUSTOM_CATEGORY_NAME]
    );

    if (!category) {
      // Create Custom Category if it doesn't exist (shouldn't happen, but safety check)
      const newCategory = await db.queryOne(
        `INSERT INTO topic_categories (category_name, topics, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id, category_name, topics, created_at, updated_at`,
        [CUSTOM_CATEGORY_NAME, JSON.stringify([])]
      );
      category = newCategory;
    }

    // 4. Count existing custom topics for Basic/FreeTrial users (only for this user)
    // Since all custom topics are now in Custom Category, we only need to check this one category
    if (isBasicOrFreeTrial) {
      const topics = category.topics || [];
      // Count topics that are custom AND created by this user
      const customTopics = topics.filter(t => 
        (t.created_by === userId || t.userId === userId)
      );

      // 5. Enforce plan limits (Basic/FreeTrial: max 5 total, Pro: unlimited)
      if (customTopics.length >= 5) {
        throw new Error('Maximum custom topics limit reached (5 topics). Upgrade to Pro for unlimited topics.');
      }
    }

    // 6. Add topic to Custom Category's topics array
    const topics = category.topics || [];
    
    // Ensure topic has required fields (including userId for tracking)
    const newTopic = {
      ...topicData,
      id: topicData.id || `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      isCustom: true, // Mark as custom topic
      created_by: userId, // Track which user created this topic
      userId: userId, // Also store as userId for compatibility
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    topics.push(newTopic);

    // 7. Update topic_categories table
    const updatedCategory = await db.queryOne(
      `UPDATE topic_categories
       SET topics = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, category_name, topics, created_at, updated_at`,
      [JSON.stringify(topics), category.id]
    );

    // 8. Return created topic
    return {
      ...newTopic,
      categoryId: updatedCategory.id,
      categoryName: updatedCategory.category_name, // Will always be "Custom Category"
    };
  },
};

module.exports = topicsService;
