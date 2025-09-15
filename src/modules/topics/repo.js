// src/modules/topics/repo.js
// Topics data access layer

const { pool } = require('../../core/db/client');

const saveTopic = async (category, topic) => {
  let client;
  try {
    client = await pool.connect();

    // Check if the category already exists
    const existingCategoryResult = await client.query(
      'SELECT id, topics FROM topic_categories WHERE category_name = $1',
      [category]
    );

    let result;
    if (existingCategoryResult.rows.length > 0) {
      // Category exists: update its topics array
      const existingTopics = existingCategoryResult.rows[0].topics || [];

      // Check if topic with same ID already exists in the array
      const topicIndex = existingTopics.findIndex(t => t.id === topic.id);

      if (topicIndex !== -1) {
        // Topic exists in array: update it
        const updatedTopics = [...existingTopics];
        updatedTopics[topicIndex] = { 
          ...updatedTopics[topicIndex], 
          ...topic,
          updated_at: new Date().toISOString()
        }; // Merge new data and add updated_at
        result = await client.query(`
          UPDATE topic_categories SET
            topics = $2,
            updated_at = CURRENT_TIMESTAMP
          WHERE category_name = $1
          RETURNING *
        `, [category, JSON.stringify(updatedTopics)]);
      } else {
        // Topic doesn't exist in array: add it
        const topicWithTimestamp = {
          ...topic,
          created_at: new Date().toISOString()
        };
        const updatedTopics = [...existingTopics, topicWithTimestamp];
        result = await client.query(`
          UPDATE topic_categories SET
            topics = $2,
            updated_at = CURRENT_TIMESTAMP
          WHERE category_name = $1
          RETURNING *
        `, [category, JSON.stringify(updatedTopics)]);
      }
    } else {
      // Category does not exist: insert a new one with the single topic
      const topicWithTimestamp = {
        ...topic,
        created_at: new Date().toISOString()
      };
      result = await client.query(`
        INSERT INTO topic_categories (category_name, topics)
        VALUES ($1, $2)
        RETURNING *
      `, [category, JSON.stringify([topicWithTimestamp])]); // Store as an array containing the single topic
    }

    return result.rows[0];
  } finally {
    if (client) client.release();
  }
};

const saveBulkTopics = async (categories) => {
  let client;
  try {
    client = await pool.connect();
    const results = [];
    
    for (const entry of categories) {
      const { category, topics } = entry;
      
      if (!category || typeof category !== 'string' || category.trim() === '') {
        results.push({ category, success: false, error: 'Category name is required and must be a non-empty string.' });
        continue;
      }
      
      if (!Array.isArray(topics) || topics.length === 0) {
        results.push({ category, success: false, error: 'Topics must be a non-empty array.' });
        continue;
      }
      
      // Fetch or create category
      const existingCategoryResult = await client.query(
        'SELECT id, topics FROM topic_categories WHERE category_name = $1',
        [category]
      );
      
      let existingTopics = [];
      if (existingCategoryResult.rows.length > 0) {
        existingTopics = existingCategoryResult.rows[0].topics || [];
      }
      
      // Merge topics
      for (const topic of topics) {
        if (!topic.title || !topic.prompt || !topic.firstPrompt) {
          results.push({ category, topic: topic.title || topic.id, success: false, error: 'Each topic must have a title, prompt, and firstPrompt.' });
          continue;
        }
        
        const topicIndex = existingTopics.findIndex(t => t.id === topic.id);
        if (topicIndex !== -1) {
          existingTopics[topicIndex] = { 
            ...existingTopics[topicIndex], 
            ...topic,
            updated_at: new Date().toISOString()
          };
        } else {
          const topicWithTimestamp = {
            ...topic,
            created_at: new Date().toISOString()
          };
          existingTopics.push(topicWithTimestamp);
        }
      }
      
      // Upsert category
      if (existingCategoryResult.rows.length > 0) {
        await client.query(
          'UPDATE topic_categories SET topics = $2, updated_at = CURRENT_TIMESTAMP WHERE category_name = $1',
          [category, JSON.stringify(existingTopics)]
        );
      } else {
        await client.query(
          'INSERT INTO topic_categories (category_name, topics) VALUES ($1, $2)',
          [category, JSON.stringify(existingTopics)]
        );
      }
      
      results.push({ category, success: true, topicCount: existingTopics.length });
    }
    
    return results;
  } finally {
    if (client) client.release();
  }
};

const getAllTopicCategories = async () => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(`
      SELECT id, category_name, topics, created_at, updated_at
      FROM topic_categories
      ORDER BY category_name ASC
    `);
    
    return result.rows;
  } finally {
    if (client) client.release();
  }
};

const getTopicCategoryByName = async (categoryName) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(`
      SELECT id, category_name, topics, created_at, updated_at
      FROM topic_categories
      WHERE category_name = $1
    `, [categoryName]);
    
    return result.rows[0];
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  saveTopic,
  saveBulkTopics,
  getAllTopicCategories,
  getTopicCategoryByName
};