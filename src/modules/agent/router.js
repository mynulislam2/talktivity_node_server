/**
 * Agent Module Router
 * Routes for agent-to-frontend communication
 */

const express = require('express');
const router = express.Router();
const agentController = require('./controller');

// POST /api/agent/session-state - Receive session state from Python agent
// Note: No authentication required - this is an internal endpoint for Python agent
router.post('/session-state', agentController.emitSessionState);

module.exports = router;
