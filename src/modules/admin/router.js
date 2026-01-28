/**
 * Admin Module Router
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../../core/http/middlewares/auth');
const adminController = require('./controller');

router.get('/users', authenticateToken, requireAdmin, adminController.listUsers);
router.delete('/users/:userId', authenticateToken, requireAdmin, adminController.deleteUser);
router.get('/stats', authenticateToken, requireAdmin, adminController.getStats);
router.post('/users/bulk-delete', authenticateToken, requireAdmin, adminController.bulkDelete);
router.get('/verify-admin', authenticateToken, requireAdmin, adminController.verifyAdmin);
router.get('/check-admin-status', authenticateToken, adminController.checkAdminStatus);

module.exports = router;
