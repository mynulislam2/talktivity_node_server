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

// Mobile endpoints - accept form data from AamarPay and return HTML with embedded payment data
// POST /api/payments/aamarpay/mobile-success - Mobile: Handle AamarPay success (returns HTML)
router.post('/aamarpay/mobile-success', express.urlencoded({ extended: true }), paymentController.handleMobilePaymentSuccess);

// POST /api/payments/aamarpay/mobile-fail - Mobile: Handle AamarPay failure (returns HTML)
router.post('/aamarpay/mobile-fail', express.urlencoded({ extended: true }), paymentController.handleMobilePaymentFail);

// POST /api/payments/aamarpay/mobile-cancel - Mobile: Handle AamarPay cancel (returns HTML)
router.post('/aamarpay/mobile-cancel', express.urlencoded({ extended: true }), paymentController.handleMobilePaymentCancel);

// POST /api/payments/webhook
router.post('/webhook', express.json(), paymentController.handleWebhook);

module.exports = router;
