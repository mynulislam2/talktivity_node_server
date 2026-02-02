/**
 * Roleplays Module Router
 * Endpoints:
 *  - GET /api/roleplays
 *  - POST /api/roleplays
 *  - DELETE /api/roleplays/:roleplayId
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const roleplaysController = require('./controller');

router.get('/', authenticateToken, roleplaysController.listRoleplays);
router.post('/', authenticateToken, roleplaysController.createRoleplay);
router.delete('/:roleplayId', authenticateToken, roleplaysController.deleteRoleplay);

module.exports = router;

