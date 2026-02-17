/**
 * LiveKit Connection Module Router
 * Routes for LiveKit token generation and connection details
 */

const express = require('express');
const router = express.Router();
const livekitConnectionController = require('./controller');

/**
 * GET /api/livekit/connection-details
 * Get full connection details for LiveKit session
 * Public endpoint - no authentication required (validation handled by token TTL)
 */
router.get('/connection-details', livekitConnectionController.getConnectionDetails);

/**
 * GET /api/livekit/token
 * Generate LiveKit token only
 * Public endpoint - no authentication required
 */
router.get('/token', livekitConnectionController.generateToken);

module.exports = router;
