/**
 * Courses Module Exports
 * Exports the main courses router with all core endpoints
 */

const coursesRouter = require('./router');
const coursesController = require('./controller');
const coursesService = require('./service');

module.exports = {
  coursesRouter,
  coursesController,
  coursesService,
};
