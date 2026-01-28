/**
 * Call Module
 * Entry point for call session management
 */

const router = require('./router');
const service = require('./service');
const controller = require('./controller');

module.exports = {
  router,
  service,
  controller,
};
