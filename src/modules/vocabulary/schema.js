/**
 * Vocabulary Module Validation Schemas
 */

const Joi = require('joi');

const vocabularySchemas = {
  markLearned: Joi.object({
    vocabularyId: Joi.number().required(),
  }),
};

module.exports = { vocabularySchemas };
