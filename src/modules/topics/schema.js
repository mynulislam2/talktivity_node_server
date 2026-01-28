/**
 * Topics Module Validation Schemas
 */

const Joi = require('joi');

const topicsSchemas = {
  startTopic: Joi.object({
    topicId: Joi.number().required(),
  }),
};

module.exports = { topicsSchemas };
