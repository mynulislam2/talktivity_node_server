/**
 * Agent Module
 * Handles agent-to-frontend communication via Socket.IO
 */

const router = require('./router');
const agentController = require('./controller');
const agentService = require('./service');

module.exports = {
  router,
  agentController,
  agentService,
};
