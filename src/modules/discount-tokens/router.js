/**
 * Discount Tokens Module Router
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const discountTokensController = require('./controller');

// POST /api/discount-tokens/validate - Validate token and get discount info
router.post('/validate', authenticateToken, discountTokensController.validateToken);

module.exports = router;
