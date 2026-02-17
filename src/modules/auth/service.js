/**
 * Auth Module Service
 * Business logic for authentication
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authRepo = require('./repo');
const { AuthError, ValidationError, ConflictError } = require('../../core/error/errors');

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
      lifecycle: {
        onboardingCompleted: user.onboarding_completed || false,
        callCompleted: user.call_completed || false,
        reportCompleted: user.report_completed || false,
        upgradeCompleted: user.upgrade_completed || false,
      },
    };
  },
};

module.exports = authService;
