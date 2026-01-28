/**
 * Topics Module Exports
 */

const topicsRouter = require('./router');
const topicsController = require('./controller');
const topicsService = require('./service');
const topicsRepo = require('./repo');
const { topicsSchemas } = require('./schema');

module.exports = { topicsRouter, topicsController, topicsService, topicsRepo, topicsSchemas };
