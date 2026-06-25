// helpers.js - Utility functions for QAS School Management System

/**
 * Convert a numeric score (0-100) to a letter grade
 */
function gradeFromScore(score) {
  const s = parseFloat(score);
  if (isNaN(s)) return 'F';
  if (s >= 80) return 'A';
  if (s >= 70) return 'B';
  if (s >= 60) return 'C';
  if (s >= 50) return 'D';
  return 'F';
}

/**
 * Return a remark string based on grade letter
 */
function remarkFromGrade(grade) {
  switch (grade) {
    case 'A': return 'Excellent';
    case 'B': return 'Very Good';
    case 'C': return 'Good';
    case 'D': return 'Pass';
    case 'F': return 'Fail';
    default:  return 'N/A';
  }
}

/**
 * Generate a unique receipt number for fee payments
 */
function generateReceiptNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const ms   = now.getTime().toString().slice(-6);
  const rand = Math.floor(Math.random() * 900 + 100); // 3-digit random
  return `RCP-${year}-${ms}${rand}`;
}

module.exports = { gradeFromScore, remarkFromGrade, generateReceiptNumber };
