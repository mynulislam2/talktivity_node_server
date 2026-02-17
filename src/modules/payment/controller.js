const paymentService = require('./service');
const { sendSuccess, sendError } = require('../../core/http/response');
const { ValidationError } = require('../../core/error/errors');

const paymentController = {
  async createPayment(req, res, next) {
    try {
      const { planType, amount, currency } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        throw new ValidationError('User authentication required');
      }

      if (!planType || !amount || !currency) {
        throw new ValidationError('Plan type, amount, and currency are required');
      }

      const result = await paymentService.createPayment(userId, planType, { amount, currency });
      sendSuccess(res, result, 201, 'Payment created successfully');
    } catch (error) {
      next(error);
    }
  },

  async createAamarPayPayment(req, res, next) {
    try {
      const { planType, amount, currency, desc, discountToken, isMobile } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        throw new ValidationError('User authentication required');
      }

      if (!planType || !amount || !currency) {
        throw new ValidationError('Plan type, amount, and currency are required');
      }

      // Detect if request is from mobile app
      const userAgent = req.headers['user-agent'] || '';
      const isMobileRequest = isMobile === true || 
                             isMobile === 'true' ||
                             /ReactNative|Expo|Android|iOS/i.test(userAgent);

      let success_url, fail_url, cancel_url;

      if (isMobileRequest) {
        // Use backend endpoints that return HTML with embedded payment data
        // AamarPay will POST to these URLs, and backend will return HTML with payment result
        // Construct URL from request (accessible from AamarPay's servers)
        // Priority: Environment variable > Request host (with forwarded headers) > localhost fallback
        let backendBaseUrl;
        if (process.env.API_BASE_URL || process.env.BACKEND_URL) {
          backendBaseUrl = process.env.API_BASE_URL || process.env.BACKEND_URL;
          console.log('[Payment] Using API_BASE_URL from environment:', backendBaseUrl);
        } else {
          // Construct from request - check forwarded headers first (for proxies/load balancers)
          const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
          const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:8082';
          backendBaseUrl = `${protocol}://${host}`;
          
          console.log('[Payment] Constructed backend URL from request:', {
            protocol,
            host,
            'x-forwarded-host': req.get('x-forwarded-host'),
            'x-forwarded-proto': req.get('x-forwarded-proto'),
            'req.host': req.get('host'),
            'req.protocol': req.protocol,
            finalUrl: backendBaseUrl
          });
          
          // Warn if using localhost (won't work from AamarPay's servers)
          if (host.includes('localhost') || host.includes('127.0.0.1')) {
            console.warn('[Payment] ⚠️  Using localhost for mobile payment redirects. AamarPay servers cannot reach localhost.');
            console.warn('[Payment] ⚠️  Set API_BASE_URL in .env to a publicly accessible URL (e.g., http://192.168.0.105:8082 or your domain).');
          }
        }
        
        success_url = `${backendBaseUrl}/api/payments/aamarpay/mobile-success`;
        fail_url = `${backendBaseUrl}/api/payments/aamarpay/mobile-fail`;
        cancel_url = `${backendBaseUrl}/api/payments/aamarpay/mobile-cancel`;
      } else {
        // Web flow - use frontend URLs
        const frontendBaseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
        success_url = `${frontendBaseUrl}/api/payment-success-redirect`;
        fail_url = `${frontendBaseUrl}/api/payment-failed-redirect`;
        cancel_url = `${frontendBaseUrl}/api/payment-cancel-redirect`;
      }

      const result = await paymentService.createAamarPayPayment(userId, planType, {
        amount,
        currency,
        desc: desc || `Talktivity ${planType} Plan Subscription`,
        discountToken,
        success_url,
        fail_url,
        cancel_url,
        cus_email: req.user.email,
        cus_name: req.user.full_name || 'Talktivity User',
        cus_phone: req.user.phone || '01XXXXXXXX',
        cus_add1: req.user.address || 'N/A',
      });

      sendSuccess(res, result, 201, 'Payment URL generated successfully');
    } catch (error) {
      next(error);
    }
  },

  async processAamarPaySuccess(req, res, next) {
    try {
      const aamarpayResponse = req.body || {};
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'success');
      sendSuccess(res, result, 200, 'Payment processed successfully');
    } catch (error) {
      next(error);
    }
  },

  async processAamarPayCancel(req, res, next) {
    try {
      const aamarpayResponse = req.body || {};
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'cancel');
      sendSuccess(res, result, 200, 'Payment cancelled');
    } catch (error) {
      next(error);
    }
  },

  async processAamarPayFail(req, res, next) {
    try {
      const aamarpayResponse = req.body || {};
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'fail');
      sendSuccess(res, result, 200, 'Payment failed');
    } catch (error) {
      next(error);
    }
  },

  /**
   * Mobile: Handle AamarPay success callback (POST from gateway)
   * Returns JSON response for mobile - frontend intercepts and navigates to static screen
   * POST /api/payments/aamarpay/mobile-success
   */
  async handleMobilePaymentSuccess(req, res) {
    try {
      // Extract form data from AamarPay POST (form-urlencoded or JSON)
      const aamarpayResponse = req.body || {};
      
      // Process payment in backend
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'success');
      
      // Verify payment actually succeeded - check AamarPay response
      const paymentStatus = aamarpayResponse.status || aamarpayResponse.pay_status || '';
      const isActuallySuccess = paymentStatus.toLowerCase().includes('success') || 
                                paymentStatus.toLowerCase().includes('successful') ||
                                aamarpayResponse.pg_txnid || 
                                aamarpayResponse.epw_txnid;
      
      // Return JSON response - frontend will intercept and navigate to static screen
      // No HTML needed for mobile
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: isActuallySuccess,
        outcome: isActuallySuccess ? 'success' : 'error',
        order_id: result.order_id,
        payment_verified: isActuallySuccess,
        data: aamarpayResponse
      });
    } catch (error) {
      console.error('Mobile payment success error:', error);
      // Return JSON error response
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        success: false,
        outcome: 'error',
        error: error.message || 'Payment processing error',
        data: req.body || {}
      });
    }
  },

  /**
   * Mobile: Handle AamarPay failure callback
   * POST /api/payments/aamarpay/mobile-fail
   */
  async handleMobilePaymentFail(req, res) {
    try {
      const aamarpayResponse = req.body || {};
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'fail');
      
      // Return JSON response - frontend will intercept and navigate to static screen
      // No HTML needed for mobile
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: false,
        outcome: 'fail',
        order_id: result.order_id,
        data: aamarpayResponse
      });
    } catch (error) {
      console.error('Mobile payment fail error:', error);
      // Even if processing fails, return success response so frontend can navigate
      // The frontend will show the failure screen regardless
      const orderId = req.body?.mer_txnid || req.body?.order_id || req.body?.tran_id || 'unknown';
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: false,
        outcome: 'fail',
        order_id: orderId,
        error: error.message || 'Payment processing error',
        data: req.body || {}
      });
    }
  },

  /**
   * Mobile: Handle AamarPay cancel callback
   * POST /api/payments/aamarpay/mobile-cancel
   */
  async handleMobilePaymentCancel(req, res) {
    try {
      const aamarpayResponse = req.body || {};
      const result = await paymentService.processAamarPayResult(aamarpayResponse, 'cancel');
      
      // Return JSON response - frontend will intercept and navigate to static screen
      // No HTML needed for mobile
      res.setHeader('Content-Type', 'application/json');
      return res.json({
        success: false,
        outcome: 'cancel',
        order_id: result.order_id,
        data: aamarpayResponse
      });
    } catch (error) {
      console.error('Mobile payment cancel error:', error);
      // Return JSON error response
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        success: false,
        outcome: 'cancel',
        error: error.message || 'Payment processing error',
        data: req.body || {}
      });
    }
  },

  async handleWebhook(req, res, next) {
    try {
      const webhookData = req.body || {};
      console.log('[Payment] Webhook received:', webhookData);
      
      // Process webhook data
      // This is a placeholder - implement based on your webhook requirements
      sendSuccess(res, { received: true }, 200, 'Webhook received');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = paymentController;
