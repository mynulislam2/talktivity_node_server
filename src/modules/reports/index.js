/**
 * Reports Module Exports
 */

const reportsRouter = require('./router');
const reportsController = require('./controller');
const reportsService = require('./service');
const reportsRepo = require('./repo');
const { reportsSchemas } = require('./schema');

module.exports = { reportsRouter, reportsController, reportsService, reportsRepo, reportsSchemas };
