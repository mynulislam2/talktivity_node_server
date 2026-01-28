/**
 * Listening Module Validation Schemas
 */

const Joi = require('joi');

const listeningSchemas = {
  logActivity: Joi.object({
    materialId: Joi.number().required(),
    durationSeconds: Joi.number().positive().required(),
  }),
};

module.exports = { listeningSchemas };
