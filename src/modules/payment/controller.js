/**
 * Payment Module Controller (Postman-aligned)
 */

const { ValidationError } = require('../../core/error/errors');
const paymentService = require('./service');

const paymentController = {
  async createPayment(req, res, next) {
    try {
      const userId = req.user?.userId;
      const plan = req.body?.planId || req.body?.planType;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      if (!plan) {
        return res.status(400).json({ success: false, error: 'planId is required' });
      }

      const payment = await paymentService.createPaymentRequest(
        userId,
        plan,
        req.ip,
        req.get('user-agent')
      );

      res.status(201).json({ success: true, data: payment });
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ success: false, error: error.message });
      }
      next(error);
    }
  },

  async handleWebhook(req, res) {
    try {
      const transactionId = req.body?.trans_id || req.body?.transactionId;
      const paymentStatus = req.body?.status || req.body?.paymentStatus;

      if (!transactionId || !paymentStatus) {
        return res.status(400).json({ success: false, error: 'Missing trans_id or status' });
      }

      const result = await paymentService.verifyPaymentWebhook(transactionId, paymentStatus);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('Payment webhook error:', error);
      return res.status(500).json({ success: false, error: 'Failed to process payment webhook' });
    }
  },

  /**
   * Create AamarPay payment
   * POST /api/payments/aamarpay/payment
   */
  async createAamarPayPayment(req, res, next) {
    try {
      const userId = req.user?.userId;
      const { planType, amount, currency, desc, cus_email, cus_name, cus_phone, cus_add1 } = req.body;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      if (!planType) {
        return res.status(400).json({ success: false, error: 'planType is required' });
      }

      // Get base URL for redirect URLs
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const payload = {
        amount,
        currency: currency || 'BDT',
        desc: desc || `Talktivity ${planType} Plan Subscription`,
        cus_email,
        cus_name,
        cus_phone,
        cus_add1,
        cancel_url: `${baseUrl}/api/payment-cancel-redirect`,
        fail_url: `${baseUrl}/api/payment-failed-redirect`,
        success_url: `${baseUrl}/api/payment-success-redirect`,
      };

      const result = await paymentService.createAamarPayPayment(userId, planType, payload);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('AamarPay payment creation error:', error);
      if (error instanceof ValidationError) {
        return res.status(400).json({ success: false, error: error.message });
      }
      next(error);
    }
  },

  /**
   * Process AamarPay success callback
   * POST /api/payments/aamarpay/process-success
   */
  async processAamarPaySuccess(req, res, next) {
    try {
      const aamarpayResponse = req.body;
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'success');
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('AamarPay success processing error:', error);
      next(error);
    }
  },

  /**
   * Process AamarPay cancel callback
   * POST /api/payments/aamarpay/process-cancel
   */
  async processAamarPayCancel(req, res, next) {
    try {
      const aamarpayResponse = req.body;
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'cancel');
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('AamarPay cancel processing error:', error);
      next(error);
    }
  },

  /**
   * Process AamarPay failure callback
   * POST /api/payments/aamarpay/process-fail
   */
  async processAamarPayFail(req, res, next) {
    try {
      const aamarpayResponse = req.body;
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'fail');
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('AamarPay fail processing error:', error);
      next(error);
    }
  },
};

module.exports = paymentController;
