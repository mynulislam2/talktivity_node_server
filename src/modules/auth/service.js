/**
 * Auth Module Service
 * Business logic for authentication
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authRepo = require('./repo');
const { AuthError, ValidationError, ConflictError } = require('../../core/error/errors');
const emailService = require('../../core/services/email');
const codeGenerator = require('../../utils/codeGenerator');

const authService = {
  async register({ email, password, fullName }) {
    // Check if user exists
    const existingUser = await authRepo.getUserByEmail(email);
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user (fullName is optional, will be collected during onboarding)
    const user = await authRepo.createUser({
      email,
      password: passwordHash,
      fullName: fullName || null,
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail(email, {
      userName: fullName || email.split('@')[0],
      appUrl: process.env.FRONTEND_URL || 'https://talktivity.app',
    }).catch((err) => {
      console.error('[AuthService] Failed to send welcome email:', err.message);
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
      token,
    };
  },

  async login({ email, password }) {
    // Get user
    const user = await authRepo.getUserByEmail(email);
    if (!user) {
      throw new AuthError('Invalid email or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new AuthError('Invalid email or password');
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create session
    await authRepo.createSession(user.id, token);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
      token,
    };
  },

  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

      const user = await authRepo.getUserById(decoded.userId);
      if (!user) {
        throw new AuthError('User not found');
      }

      // Generate a new access token (7 days by default, aligned with existing login/register)
      const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Approximate expiry in seconds for client-side token management
      const expiresIn = 7 * 24 * 60 * 60;

      return { accessToken, expiresIn };
    } catch (error) {
      throw new AuthError('Invalid refresh token');
    }
  },

  async getCurrentUser(userId) {
    const user = await authRepo.getUserById(userId);
    if (!user) {
      throw new AuthError('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      profile_picture: user.profile_picture || null,
      emailVerifiedAt: user.email_verified_at || null,
      lifecycle: {
        onboardingCompleted: user.onboarding_completed || false,
        callCompleted: user.call_completed || false,
        reportCompleted: user.report_completed || false,
        upgradeCompleted: user.upgrade_completed || false,
      },
    };
  },

  // ==========================================
  // Password Reset Methods
  // ==========================================

  /**
   * Generate and send password reset code
   * @param {string} email - User email
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async generateAndSendResetCode(email) {
    try {
      const user = await authRepo.getUserByEmail(email);
      if (!user) {
        // Return success for security (don't reveal if email exists)
        console.warn(`Password reset requested for non-existent email: ${email}`);
        return { success: true, message: 'If this email exists, a code has been sent' };
      }

      const code = codeGenerator.generateOTP();
      const expiryMinutes = codeGenerator.getOTPExpiryMinutes();
      const expiryTime = codeGenerator.generateExpiryTime(expiryMinutes);

      // Save code to database
      await authRepo.setPasswordResetCode(user.id, code, expiryTime);

      // Send email
      const emailResult = await emailService.sendPasswordResetCode(email, code, expiryMinutes);

      if (!emailResult.success) {
        console.error(`Failed to send reset code to ${email}:`, emailResult.error);
        await authRepo.clearPasswordResetCode(user.id);
        return { success: false, error: 'Failed to send code. Please try again.' };
      }

      return { success: true, message: 'Code sent to email' };
    } catch (error) {
      console.error('Error in generateAndSendResetCode:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Verify password reset code
   * @param {string} email - User email
   * @param {string} code - 6-digit code
   * @returns {Promise<{success: boolean, verified?: boolean, error?: string}>}
   */
  async verifyResetCode(email, code) {
    try {
      const user = await authRepo.getUserByEmailWithResetCode(email);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (!user.password_reset_code) {
        return { success: false, error: 'No reset code requested. Request a new code.' };
      }

      if (user.password_reset_code !== code) {
        return { success: false, error: 'Invalid code' };
      }

      if (codeGenerator.isCodeExpired(user.password_reset_code_expiry)) {
        await authRepo.clearPasswordResetCode(user.id);
        return { success: false, error: 'Code expired. Request a new code.' };
      }

      return { success: true, verified: true };
    } catch (error) {
      console.error('Error in verifyResetCode:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Reset password with verified code
   * @param {string} email - User email
   * @param {string} code - 6-digit code
   * @param {string} newPassword - New password
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async resetPassword(email, code, newPassword) {
    try {
      // Verify code first
      const verification = await this.verifyResetCode(email, code);
      if (!verification.success) {
        return verification;
      }

      // Validate password strength
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.message };
      }

      const user = await authRepo.getUserByEmail(email);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await authRepo.updatePassword(user.id, hashedPassword);

      // Send confirmation email
      const emailResult = await emailService.sendPasswordResetConfirmation(email, user.full_name || 'User');
      if (!emailResult.success) {
        console.error(`Failed to send reset confirmation to ${email}:`, emailResult.error);
      }

      return { success: true, message: 'Password updated successfully' };
    } catch (error) {
      console.error('Error in resetPassword:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {{valid: boolean, message?: string}}
   */
  validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (password.length < minLength) {
      return { valid: false, message: `Password must be at least ${minLength} characters` };
    }
    if (!hasUpperCase) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!hasLowerCase) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!hasNumber) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!hasSymbol) {
      return { valid: false, message: 'Password must contain at least one symbol' };
    }

    return { valid: true };
  },

  // ==========================================
  // Email Verification Methods
  // ==========================================

  /**
   * Send email verification code
   * @param {number} userId - User ID
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async sendEmailVerificationCode(userId) {
    try {
      const user = await authRepo.getUserByIdWithVerification(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.email_verified_at) {
        return { success: true, message: 'Email already verified' };
      }

      const code = codeGenerator.generateOTP();
      const expiryMinutes = codeGenerator.getOTPExpiryMinutes();
      const expiryTime = codeGenerator.generateExpiryTime(expiryMinutes);

      await authRepo.setVerificationCode(userId, code, expiryTime);

      const emailResult = await emailService.sendEmailVerificationCode(user.email, code, expiryMinutes);

      if (!emailResult.success) {
        console.error(`Failed to send verification code to ${user.email}:`, emailResult.error);
        return { success: false, error: 'Failed to send code. Please try again.' };
      }

      return { success: true, message: 'Verification code sent' };
    } catch (error) {
      console.error('Error in sendEmailVerificationCode:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Verify email with code
   * @param {number} userId - User ID
   * @param {string} code - 6-digit code
   * @returns {Promise<{success: boolean, email_verified?: boolean, error?: string}>}
   */
  async verifyEmail(userId, code) {
    try {
      const user = await authRepo.getUserByIdWithVerification(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.email_verified_at) {
        return { success: true, email_verified: true, message: 'Email already verified' };
      }

      if (!user.verification_code) {
        return { success: false, error: 'No verification code requested' };
      }

      if (user.verification_code !== code) {
        return { success: false, error: 'Invalid code' };
      }

      if (codeGenerator.isCodeExpired(user.verification_code_expiry)) {
        return { success: false, error: 'Code expired. Request a new code.' };
      }

      await authRepo.markEmailVerified(userId);

      return { success: true, email_verified: true };
    } catch (error) {
      console.error('Error in verifyEmail:', error);
      return { success: false, error: error.message };
    }
  },
};

module.exports = authService;
