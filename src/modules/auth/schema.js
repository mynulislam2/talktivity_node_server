// src/modules/auth/schema.js
// Authentication validation schemas

const { body } = require('express-validator');

const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('full_name').notEmpty()
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

const changePasswordValidation = [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 })
];

module.exports = {
  registerValidation,
  loginValidation,
  changePasswordValidation
};