// src/modules/groups/schema.js
// Groups validation schemas

const { body, param } = require('express-validator');

const createGroupValidation = [
  body('name').notEmpty().isLength({ min: 1, max: 255 }),
  body('description').optional().isString(),
  body('category').optional().isString(),
  body('is_public').optional().isBoolean()
];

const joinGroupValidation = [
  param('groupId').isInt({ min: 1 })
];

module.exports = {
  createGroupValidation,
  joinGroupValidation
};