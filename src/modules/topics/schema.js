// src/modules/topics/schema.js
// Topics validation schemas

const { body, param } = require('express-validator');

const createTopicValidation = [
  body('category').notEmpty().isString(),
  body('topic').notEmpty().isObject()
];

const createBulkTopicsValidation = [
  body().isArray({ min: 1 })
];

module.exports = {
  createTopicValidation,
  createBulkTopicsValidation
};