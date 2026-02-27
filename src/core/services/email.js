/**
 * Email Service
 * Centralized email sending using Resend API
 */

const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

class EmailService {
  constructor() {
    this.resend = null;
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@talktivity.app';
    this.fromName = process.env.RESEND_FROM_NAME || 'Talktivity';
    this.replyTo = process.env.RESEND_REPLY_TO || 'support@talktivity.app';
    this.initialized = false;
  }

  /**
   * Initialize the Resend client
   * Called lazily on first email send to allow graceful startup
   */
  init() {
    if (this.initialized) return true;

    if (!process.env.RESEND_API_KEY) {
      console.warn('[EmailService] RESEND_API_KEY not configured - email sending disabled');
      return false;
    }

    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.initialized = true;
    console.log('[EmailService] Initialized successfully');
    return true;
  }

  /**
   * Load and render HTML template with variable substitution
   * @param {string} templateName - Name of template file (without .html)
   * @param {object} variables - Key-value pairs to substitute
   * @returns {string} Rendered HTML
   */
  loadTemplate(templateName, variables = {}) {
    try {
      const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
      let html = fs.readFileSync(templatePath, 'utf8');

      // Simple variable replacement: {{variableName}}
      Object.keys(variables).forEach((key) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, variables[key]);
      });

      return html;
    } catch (error) {
      console.error(`[EmailService] Failed to load template ${templateName}:`, error.message);
      throw new Error(`Email template not found: ${templateName}`);
    }
  }

  /**
   * Send an email using Resend API
   * @param {object} options - Email options
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendEmail({ to, subject, html, text, type = 'transactional' }) {
    if (!this.init()) {
      console.warn(`[EmailService] Skipping email to ${to} - service not initialized`);
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const response = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to,
        subject,
        html,
        text,
        replyTo: this.replyTo,
        headers: {
          'X-Email-Type': type,
        },
      });

      if (response.error) {
        console.error(`[EmailService] Error sending to ${to}:`, response.error);
        return { success: false, error: response.error.message };
      }

      console.log(`[EmailService] Email sent to ${to}, type: ${type}, ID: ${response.data?.id}`);
      return { success: true, messageId: response.data?.id };
    } catch (error) {
      console.error(`[EmailService] Exception sending email to ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset code email
   * @param {string} to - Recipient email
   * @param {string} code - 6-digit OTP code
   * @param {number} expiryMinutes - Minutes until code expires
   */
  async sendPasswordResetCode(to, code, expiryMinutes = 10) {
    const html = this.loadTemplate('passwordResetCode', {
      code,
      expiryMinutes: expiryMinutes.toString(),
    });

    return this.sendEmail({
      to,
      subject: 'Reset Your Talktivity Password',
      html,
      type: 'password_reset',
    });
  }

  /**
   * Send password reset confirmation email
   * @param {string} to - Recipient email
   * @param {string} userName - User's name for personalization
   */
  async sendPasswordResetConfirmation(to, userName = 'User') {
    const html = this.loadTemplate('passwordResetConfirmation', {
      userName,
    });

    return this.sendEmail({
      to,
      subject: 'Your Talktivity Password Has Been Reset',
      html,
      type: 'password_reset_confirmation',
    });
  }

  /**
   * Send email verification code
   * @param {string} to - Recipient email
   * @param {string} code - 6-digit OTP code
   * @param {number} expiryMinutes - Minutes until code expires
   */
  async sendEmailVerificationCode(to, code, expiryMinutes = 10) {
    const html = this.loadTemplate('emailVerificationCode', {
      code,
      expiryMinutes: expiryMinutes.toString(),
    });

    return this.sendEmail({
      to,
      subject: 'Verify Your Talktivity Email',
      html,
      type: 'email_verification',
    });
  }

  /**
   * Send payment confirmation email
   * @param {string} to - Recipient email
   * @param {object} details - Payment details
   */
  async sendPaymentConfirmation(to, { userName, planName, amount, transactionId, billingPeriod }) {
    const html = this.loadTemplate('paymentConfirmation', {
      userName: userName || 'User',
      planName: planName || 'Pro',
      amount: amount?.toString() || '0',
      transactionId: transactionId || 'N/A',
      billingPeriod: billingPeriod || '1 month',
    });

    return this.sendEmail({
      to,
      subject: 'Payment Confirmation - Talktivity Subscription',
      html,
      type: 'payment_confirmation',
    });
  }

  /**
   * Send welcome email to new users
   * @param {string} to - Recipient email
   * @param {object} details - User details
   */
  async sendWelcomeEmail(to, { userName, appUrl = 'https://talktivity.app' }) {
    const html = this.loadTemplate('welcomeEmail', {
      userName: userName || 'there',
      appUrl,
    });

    return this.sendEmail({
      to,
      subject: 'Welcome to Talktivity! 🎉',
      html,
      type: 'welcome',
    });
  }
}

module.exports = new EmailService();
