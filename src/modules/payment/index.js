/**
 * Payment Module Exports
 */

const paymentRouter = require('./router');
const paymentController = require('./controller');
const paymentService = require('./service');

module.exports = { paymentRouter, paymentController, paymentService };
