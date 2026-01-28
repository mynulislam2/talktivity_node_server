/**
 * Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const { AuthError } = require('../../error/errors');
const db = require('../../db/client');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(new AuthError('No token provided'));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return next(new AuthError('Invalid or expired token'));
    }

    req.user = user;
    next();
  });
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
};

module.exports = { authenticateToken, optionalAuth };

/**
 * Require Admin Middleware
 * Ensures the authenticated user has admin privileges
 */
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return next(new AuthError('Not authenticated'));
    }

    const user = await db.queryOne(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (!user || !user.is_admin) {
      return next(new AuthError('Admin privileges required'));
    }

    next();
  } catch (err) {
    next(new AuthError('Admin check failed'));
  }
};

module.exports.requireAdmin = requireAdmin;
