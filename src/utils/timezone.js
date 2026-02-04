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

/**
 * Calculate days elapsed since a given start date (both treated as UTC)
 * Used for course week/day calculations
 * 
 * @param {Date|string} startDate - Start date as Date object or "YYYY-MM-DD" string
 * @returns {number} Number of complete days elapsed (0 = same day, 1 = next day)
 * 
 * @example
 * getDaysSinceUtc("2026-01-01")
 * // On 2026-01-01: returns 0
 * // On 2026-01-02: returns 1
 */
function getDaysSinceUtc(startDate) {
  let start;
  
  if (typeof startDate === 'string') {
    start = toUtcMidnight(startDate);
  } else if (startDate instanceof Date) {
    start = startDate;
  } else {
    throw new TypeError('startDate must be a Date or "YYYY-MM-DD" string');
  }
  
  const today = toUtcMidnight(getUtcToday());
  const diffMs = today.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, days);
}

/**
 * Calculate current week and day in a 12-week course
 * 
 * Week/Day Mapping:
 * - Week 1: Days 0-6 (UTC dates)
 * - Week 2: Days 7-13 (UTC dates)
 * - Week 12: Days 77-83 (UTC dates)
 * 
 * @param {Date|string} courseStartDate - When course started ("YYYY-MM-DD" or Date)
 * @returns {object} { week: number (1-12), day: number (1-7) }
 * 
 * @example
 * calculateCourseProgress("2026-01-01")
 * // On 2026-01-01: { week: 1, day: 1 }
 * // On 2026-01-08: { week: 2, day: 1 } ← Batch triggers here
 */
function calculateCourseProgress(courseStartDate) {
  const daysSinceStart = getDaysSinceUtc(courseStartDate);
  const week = Math.floor(daysSinceStart / 7) + 1;
  const day = (daysSinceStart % 7) + 1;
  return { week, day };
}

/**
 * Check if it's the first day of a new week (triggers batch generation)
 * 
 * @param {Date|string} courseStartDate - When course started
 * @returns {boolean} true if today is day 1 of any week
 */
function isFirstDayOfWeek(courseStartDate) {
  const { day } = calculateCourseProgress(courseStartDate);
  return day === 1;
}

/**
 * Check if it's the last day of a course week (speaking exam day)
 * 
 * @param {Date|string} courseStartDate - When course started
 * @returns {boolean} true if today is day 7 of any week
 */
function isLastDayOfWeek(courseStartDate) {
  const { day } = calculateCourseProgress(courseStartDate);
  return day === 7;
}

module.exports = {
  getUtcNow,
  getUtcToday,
  toUtcDateString,
  toUtcMidnight,
  getDaysSinceUtc,
  calculateCourseProgress,
  isFirstDayOfWeek,
  isLastDayOfWeek,
};
