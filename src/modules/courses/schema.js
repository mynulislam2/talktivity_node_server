/**
 * Courses Module Validation Schemas
 */

const Joi = require('joi');

const coursesSchemas = {
  initializeCourse: Joi.object({
    // No required fields for initialization
  }),
};

module.exports = {
  coursesSchemas,
};
