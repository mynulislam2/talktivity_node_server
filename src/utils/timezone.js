/**
 * Timezone utility functions for UTC operations.
 * Ensures all datetime operations use UTC regardless of system timezone.
 */

/**
 * Get current UTC datetime as Date object.
 * 
 * @returns {Date} Current UTC datetime
 */
function getUtcNow() {
  return new Date();
}

/**
 * Get today's date in UTC timezone as YYYY-MM-DD string.
 * 
 * @returns {string} Today's date in YYYY-MM-DD format (UTC)
 */
function getUtcToday() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert a date to UTC date string (YYYY-MM-DD format).
 * 
 * @param {Date|string} dateInput - Date object or ISO string
 * @returns {string} Date string in YYYY-MM-DD format (UTC)
 */
function toUtcDateString(dateInput) {
  if (!dateInput) {
    return getUtcToday();
  }
  
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalize a date to UTC midnight for accurate date comparisons.
 * 
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date} Date object representing UTC midnight of the given date
 */
function toUtcMidnight(dateStr) {
  if (!dateStr) {
    return new Date(getUtcToday() + 'T00:00:00.000Z');
  }
  
  // Ensure dateStr is in YYYY-MM-DD format
  const normalizedDate = dateStr.split('T')[0];
  return new Date(normalizedDate + 'T00:00:00.000Z');
}

module.exports = {
  getUtcNow,
  getUtcToday,
  toUtcDateString,
  toUtcMidnight,
};
