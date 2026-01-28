/**
 * Reports Module Validation Schemas
 */

const Joi = require('joi');

const reportsSchemas = {
  generateReport: Joi.object({
    conversationId: Joi.number().required(),
  }),
};

module.exports = { reportsSchemas };
