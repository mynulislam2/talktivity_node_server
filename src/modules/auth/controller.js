/**
 * Auth Module Controller
 */

const { sendSuccess, sendError } = require('../../core/http/response');
const authService = require('./service');
const { ValidationError } = require('../../core/error/errors');

const authController = {
  async register(req, res, next) {
    try {
      const { email, password, fullName } = req.body;

      if (!email || !password || !fullName) {
        throw new ValidationError('Email, password, and fullName are required');
      }

      const result = await authService.register({ email, password, fullName });
      sendSuccess(res, result, 201, 'Registration successful');
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const result = await authService.login({ email, password });
      sendSuccess(res, result, 200, 'Login successful');
    } catch (error) {
      next(error);
    }
  },

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new ValidationError('Refresh token is required');
      }

      const result = await authService.refreshToken(refreshToken);
      sendSuccess(res, result, 200, 'Token refreshed');
    } catch (error) {
      next(error);
    }
  },

  async getCurrentUser(req, res, next) {
    try {
      const userId = req.user.userId;
      const user = await authService.getCurrentUser(userId);
      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res, next) {
    try {
      // Stateless JWT: client drops token; we still return a success envelope for symmetry
      sendSuccess(res, { loggedOut: true }, 200, 'Logged out');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = authController;
