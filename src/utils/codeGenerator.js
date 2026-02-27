/**
 * Code Generator Utility
 * Generates OTP codes and handles expiry logic
 */

const crypto = require('crypto');

class CodeGenerator {
  /**
   * Generate a 6-digit numeric OTP
   * @returns {string} 6-digit code
   */
  generateOTP() {
    // Use crypto for better randomness
    const randomBytes = crypto.randomBytes(3);
    const number = parseInt(randomBytes.toString('hex'), 16) % 900000 + 100000;
    return number.toString();
  }

  /**
   * Generate expiry timestamp
   * @param {number} minutesFromNow - Minutes until expiry
   * @returns {Date} Expiry date/time
   */
  generateExpiryTime(minutesFromNow = 10) {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + minutesFromNow);
    return expiry;
  }

  /**
   * Check if code has expired
   * @param {Date|string} expiryTime - Expiry timestamp
   * @returns {boolean} True if expired
   */
  isCodeExpired(expiryTime) {
    if (!expiryTime) return true;
    return new Date() > new Date(expiryTime);
  }

  /**
   * Validate OTP format (6 digits)
   * @param {string} code - Code to validate
   * @returns {boolean} True if valid format
   */
  isValidOTP(code) {
    return /^\d{6}$/.test(code);
  }

  /**
   * Generate cryptographic token for future use (links, etc.)
   * @param {number} length - Byte length (output will be 2x in hex)
   * @returns {string} Hex token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Get OTP expiry duration in minutes from environment
   * @returns {number} Minutes
   */
  getOTPExpiryMinutes() {
    return parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
  }
}

module.exports = new CodeGenerator();
