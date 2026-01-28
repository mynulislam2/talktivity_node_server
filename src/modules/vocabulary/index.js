/**
 * Vocabulary Module Exports
 */

const vocabularyRouter = require('./router');
const vocabularyController = require('./controller');
const vocabularyService = require('./service');
const vocabularyRepo = require('./repo');
const { vocabularySchemas } = require('./schema');

module.exports = { vocabularyRouter, vocabularyController, vocabularyService, vocabularyRepo, vocabularySchemas };
