/**
 * Admin Module Controller
 */

const { sendSuccess } = require('../../core/http/response');
const adminService = require('./service');

const adminController = {
  async listUsers(req, res, next) {
    try {
      const { search, page = 1, limit = 20 } = req.query;
      const data = await adminService.getUsers({ search, page: Number(page), limit: Number(limit) });
      sendSuccess(res, data, 200, 'Users retrieved');
    } catch (error) {
      next(error);
    }
  },

  async deleteUser(req, res, next) {
    try {
      const { userId } = req.params;
      const result = await adminService.deleteUser(userId);
      if (!result.found) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      sendSuccess(res, { message: 'User deleted successfully' }, 200);
    } catch (error) {
      next(error);
    }
  },

  async getStats(req, res, next) {
    try {
      const stats = await adminService.getStats();
      sendSuccess(res, stats, 200, 'Stats retrieved');
    } catch (error) {
      next(error);
    }
  },

  async bulkDelete(req, res, next) {
    try {
      const { userIds } = req.body;
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ success: false, error: 'User IDs array is required' });
      }
      const result = await adminService.bulkDelete(userIds);
      sendSuccess(res, { message: `${result.deletedCount} users/devices deleted successfully` }, 200);
    } catch (error) {
      next(error);
    }
  },

  async verifyAdmin(req, res, next) {
    try {
      const isAdmin = await adminService.verifyAdmin(req.user.userId);
      if (!isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin privileges not found' });
      }
      sendSuccess(res, { isAdmin: true, message: 'Admin access verified' }, 200);
    } catch (error) {
      next(error);
    }
  },

  async checkAdminStatus(req, res, next) {
    try {
      const isAdmin = await adminService.checkAdminStatus(req.user.userId);
      sendSuccess(res, { isAdmin }, 200, 'Admin status checked');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = adminController;
