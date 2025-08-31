// routes/topic-routes.js
const express = require('express');
const { pool } = require('../db');
const router = express.Router();
const { authenticateToken } = require('./auth-routes');

// POST /api/topics - Add a single topic to an existing category or create a new category with the topic
router.post('/topics', authenticateToken, async (req, res) => {
    let client;
    try {
        const { category, topic } = req.body; // Expecting 'category' string and 'topic' object

        // Basic validation
        if (!category || typeof category !== 'string' || category.trim() === '') {
            return res.status(400).json({ success: false, error: 'Category name is required and must be a non-empty string.' });
        }
        if (!topic || typeof topic !== 'object' || Array.isArray(topic)) {
            return res.status(400).json({ success: false, error: 'A single topic object is required.' });
        }
        if (!topic.title || !topic.prompt || !topic.firstPrompt) {
            return res.status(400).json({ success: false, error: 'The topic must have a title, prompt, and firstPrompt.' });
        }

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

        res.status(200).json({
            success: true,
            message: 'Topic saved/updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Error saving topic data:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to save topic data at this time. Please try again later.'
        });
    } finally {
        if (client) client.release();
    }
});

// POST /api/topics/bulk - Add multiple topics to multiple categories in one request
router.post('/topics/bulk', authenticateToken, async (req, res) => {
    let client;
    try {
        const categories = req.body;
        if (!Array.isArray(categories)) {
            return res.status(400).json({ success: false, error: 'Request body must be an array of { category, topics } objects.' });
        }
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
        res.status(200).json({ success: true, results });
    } catch (error) {
        console.error('Error in bulk topic upload:', error);
        res.status(500).json({ success: false, error: 'Unable to upload topics at this time. Please try again later.' });
    } finally {
        if (client) client.release();
    }
});

// GET /api/topics - Get all topic categories
router.get('/topics', authenticateToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(`
            SELECT id, category_name, topics, created_at, updated_at
            FROM topic_categories
            ORDER BY category_name ASC
        `);
        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching topic categories:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to retrieve topic categories at this time. Please try again later.'
        });
    } finally {
        if (client) client.release();
    }
});

// GET /api/topics/:category_name - Get a specific topic category by name
router.get('/topics/:category_name', authenticateToken, async (req, res) => {
    let client;
    try {
        const { category_name } = req.params;
        if (!category_name) {
            return res.status(400).json({ success: false, error: 'Category name is required' });
        }
        client = await pool.connect();
        const result = await client.query(`
            SELECT id, category_name, topics, created_at, updated_at
            FROM topic_categories
            WHERE category_name = $1
        `, [category_name]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Topic category not found' });
        }
        res.status(200).json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error(`Error fetching topic category '${req.params.category_name}':`, error);
        res.status(500).json({
            success: false,
            error: 'Unable to retrieve topic category at this time. Please try again later.'
        });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;