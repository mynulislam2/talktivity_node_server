/**
 * Subscriptions Module Validation Schemas
 */

const Joi = require('joi');

const subscriptionsSchemas = {
  activateFreeTrial: Joi.object({
    // No required fields for free trial activation
  }),
};

module.exports = {
  subscriptionsSchemas,
};
