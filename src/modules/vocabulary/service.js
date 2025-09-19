// src/modules/vocabulary/service.js
// Vocabulary business logic

const db = require('../../core/db/client');

// Get all vocabulary
const fetchAllVocabulary = async () => {
  let client;
  try {
    client = await db.pool.connect();
    
    // Get all vocabulary words grouped by week and day
    const wordsResult = await client.query(
      `SELECT 
         w.id,
         w.word,
         w.meaning_bn,
         w.example_en,
         w.example_bn,
         w.week_number,
         w.day_number,
         w.word_order,
         w.created_at
       FROM vocabulary_words w
       ORDER BY w.week_number ASC, w.day_number ASC, w.word_order ASC, w.word ASC`
    );

    // Group words by week and day
    const groupedVocabulary = {};
    wordsResult.rows.forEach(word => {
      const key = `week_${word.week_number}_day_${word.day_number}`;
      if (!groupedVocabulary[key]) {
        groupedVocabulary[key] = {
          week: word.week_number,
          day: word.day_number,
          words: []
        };
      }
      groupedVocabulary[key].words.push(word);
    });

    return Object.values(groupedVocabulary);
  } finally {
    if (client) client.release();
  }
};

// Get words for specific week and day
const fetchVocabularyWords = async (weekNumber, dayNumber) => {
  let client;
  try {
    client = await db.pool.connect();
    
    // Get words for the specified week and day
    const wordsResult = await client.query(
      `SELECT 
         w.id,
         w.word,
         w.meaning_bn,
         w.example_en,
         w.example_bn,
         w.word_order,
         w.created_at
       FROM vocabulary_words w
       WHERE w.week_number = $1 AND w.day_number = $2
       ORDER BY w.word_order ASC, w.word ASC`,
      [weekNumber, dayNumber]
    );

    // Check if day exists
    const dayExists = await client.query(
      `SELECT id FROM vocabulary_days WHERE week_number = $1 AND day_number = $2`,
      [weekNumber, dayNumber]
    );

    if (dayExists.rows.length === 0) {
      return null;
    }

    return {
      week: weekNumber,
      day: dayNumber,
      words: wordsResult.rows,
      totalWords: wordsResult.rows.length
    };

  } finally {
    if (client) client.release();
  }
};

module.exports = {
  fetchAllVocabulary,
  fetchVocabularyWords
};