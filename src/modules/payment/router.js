/**
 * Payment Module Router (Postman-aligned)
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/http/middlewares/auth');
const paymentController = require('./controller');

// POST /api/payments/create
router.post('/create', authenticateToken, paymentController.createPayment);

// POST /api/payments/aamarpay/payment - Create AamarPay payment
router.post('/aamarpay/payment', authenticateToken, paymentController.createAamarPayPayment);

// POST /api/payments/aamarpay/process-success - Process AamarPay success callback
router.post('/aamarpay/process-success', express.json(), paymentController.processAamarPaySuccess);

// POST /api/payments/aamarpay/process-cancel - Process AamarPay cancel callback
router.post('/aamarpay/process-cancel', express.json(), paymentController.processAamarPayCancel);

// POST /api/payments/aamarpay/process-fail - Process AamarPay failure callback
router.post('/aamarpay/process-fail', express.json(), paymentController.processAamarPayFail);

// POST /api/payments/webhook
router.post('/webhook', express.json(), paymentController.handleWebhook);

module.exports = router;
