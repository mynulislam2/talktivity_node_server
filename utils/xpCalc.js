/**
 * Shared XP calculation formula
 * @param {Object} stats - Stats object
 * @param {number} stats.speakingSeconds - Total speaking time in seconds
 * @param {number} stats.fullSessions - Number of full 5-minute sessions
 * @param {number} stats.quizzes - Number of quizzes completed
 * @param {number} stats.exams - Number of exams passed
 * @param {number} stats.streak - Current streak in days
 * @returns {number} Total XP
 */
const calculateXP = (stats) => {
  const {
    speakingSeconds = 0,
    fullSessions = 0,
    quizzes = 0,
    exams = 0,
    streak = 0
  } = stats;

  const totalMinutes = Math.floor(speakingSeconds / 60);
  
  return (
    totalMinutes * 2 +
    fullSessions * 10 +
    quizzes * 15 +
    exams * 50 +
    streak * 5
  );
};

/**
 * Shared Level calculation from XP
 * @param {number} xp - Total XP
 * @returns {number} User level
 */
const calculateLevel = (xp) => {
  return Math.floor(xp / 100) + 1;
};

module.exports = {
  calculateXP,
  calculateLevel
};
