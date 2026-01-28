/**
 * Auth Module Exports
 */

const authRouter = require('./router');
const authController = require('./controller');
const authService = require('./service');
const authRepo = require('./repo');
const { authSchemas } = require('./schema');
const googleAuthRouter = require('./google-auth-routes');
const googleAuthController = require('./google-auth-controller');
const googleAuthService = require('./google-auth-service');

module.exports = {
  authRouter,
  authController,
  authService,
  authRepo,
  authSchemas,
  googleAuthRouter,
  googleAuthController,
  googleAuthService,
};
