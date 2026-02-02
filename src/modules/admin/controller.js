/**
 * Admin Module Controller
 */

const { sendSuccess } = require('../../core/http/response');
const adminService = require('./service');

const adminController = {
  async listUsers(req, res, next) {
    try {
      const { search, page = 1, limit = 20, usedDiscountToken } = req.query;
      const filters = {
        search,
        page: Number(page),
        limit: Number(limit),
        usedDiscountToken: usedDiscountToken === 'true' ? true : usedDiscountToken === 'false' ? false : undefined
      };
      const data = await adminService.getUsers(filters);
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

  // Discount Token Controllers
  async createDiscountToken(req, res, next) {
    try {
      const { token_code, discount_percent, plan_type, expires_at, max_uses } = req.body;
      
      if (!token_code || discount_percent === undefined) {
        return res.status(400).json({ success: false, error: 'Token code and discount percent are required' });
      }

      if (discount_percent < 0 || discount_percent > 100) {
        return res.status(400).json({ success: false, error: 'Discount percent must be between 0 and 100' });
      }

      const tokenData = {
        token_code,
        discount_percent: parseFloat(discount_percent),
        plan_type: plan_type || null,
        expires_at: expires_at || null,
        max_uses: max_uses ? parseInt(max_uses) : null,
        created_by: req.user.userId
      };

      const token = await adminService.createDiscountToken(tokenData);
      sendSuccess(res, token, 201, 'Discount token created successfully');
    } catch (error) {
      if (error.message === 'Token code already exists') {
        return res.status(409).json({ success: false, error: error.message });
      }
      next(error);
    }
  },

  async getDiscountTokens(req, res, next) {
    try {
      const tokens = await adminService.getDiscountTokens();
      sendSuccess(res, tokens, 200, 'Discount tokens retrieved');
    } catch (error) {
      next(error);
    }
  },

  async updateDiscountToken(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (updates.discount_percent !== undefined && (updates.discount_percent < 0 || updates.discount_percent > 100)) {
        return res.status(400).json({ success: false, error: 'Discount percent must be between 0 and 100' });
      }

      const token = await adminService.updateDiscountToken(parseInt(id), updates);
      sendSuccess(res, token, 200, 'Discount token updated successfully');
    } catch (error) {
      if (error.message === 'Token not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      if (error.message === 'Token code already exists') {
        return res.status(409).json({ success: false, error: error.message });
      }
      next(error);
    }
  },

  async deleteDiscountToken(req, res, next) {
    try {
      const { id } = req.params;
      const result = await adminService.deleteDiscountToken(parseInt(id));
      sendSuccess(res, result, 200, 'Discount token deleted successfully');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = adminController;
