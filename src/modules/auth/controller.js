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

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const result = await authService.register({ email, password, fullName: fullName || null });
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

  // ==========================================
  // Password Reset Endpoints
  // ==========================================

  /**
   * POST /api/auth/forgot-password
   * Send password reset code to email
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ValidationError('Valid email required');
      }

      const result = await authService.generateAndSendResetCode(email);

      if (!result.success) {
        return sendError(res, result.error, 400, 'RESET_CODE_SEND_FAILED');
      }

      sendSuccess(res, { message: result.message }, 200, 'Code sent to your email');
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/verify-reset-code
   * Verify the password reset code
   */
  async verifyResetCode(req, res, next) {
    try {
      const { email, code, password_reset_code } = req.body;
      // Support both 'code' (from frontend) and 'password_reset_code' (legacy)
      const resetCode = code || password_reset_code;

      if (!email) {
        throw new ValidationError('Email required');
      }

      if (!resetCode || !/^\d{6}$/.test(String(resetCode).trim())) {
        throw new ValidationError('Invalid code format');
      }

      const result = await authService.verifyResetCode(email, String(resetCode).trim());

      if (!result.success) {
        return sendError(res, result.error, 400, 'VERIFICATION_FAILED');
      }

      sendSuccess(res, { verified: true }, 200, 'Code verified');
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/reset-password
   * Reset password with verified code
   */
  async resetPassword(req, res, next) {
    try {
      const { email, code, password_reset_code, newPassword, new_password } = req.body;
      // Support both 'code' (from frontend) and 'password_reset_code' (legacy)
      const resetCode = code || password_reset_code;
      // Support both 'newPassword' (from frontend) and 'new_password' (legacy)
      const newPasswordValue = newPassword || new_password;

      if (!email || !resetCode || !newPasswordValue) {
        throw new ValidationError('Email, code, and new password required');
      }

      const result = await authService.resetPassword(email, String(resetCode).trim(), newPasswordValue);

      if (!result.success) {
        return sendError(res, result.error, 400, 'PASSWORD_RESET_FAILED');
      }

      sendSuccess(res, { message: result.message }, 200, 'Password updated successfully');
    } catch (error) {
      next(error);
    }
  },

  // ==========================================
  // Email Verification Endpoints
  // ==========================================

  /**
   * POST /api/auth/send-verification-email
   * Send email verification code (authenticated)
   */
  async sendEmailVerificationCode(req, res, next) {
    try {
      const userId = req.user.userId;

      const result = await authService.sendEmailVerificationCode(userId);

      if (!result.success) {
        return sendError(res, result.error, 400, 'VERIFICATION_SEND_FAILED');
      }

      sendSuccess(res, { message: result.message }, 200, result.message);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/verify-email
   * Verify email with code (authenticated)
   */
  async verifyEmail(req, res, next) {
    try {
      const userId = req.user.userId;
      const { verification_code } = req.body;

      if (!verification_code || !/^\d{6}$/.test(verification_code)) {
        throw new ValidationError('Invalid code format');
      }

      const result = await authService.verifyEmail(userId, verification_code);

      if (!result.success) {
        return sendError(res, result.error, 400, 'VERIFICATION_FAILED');
      }

      sendSuccess(res, { email_verified: true }, 200, 'Email verified successfully');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = authController;
