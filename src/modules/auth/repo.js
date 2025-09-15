// src/modules/auth/repo.js
// Authentication data access layer

const { pool } = require('../../core/db/client');
const bcrypt = require('bcrypt');
const { config } = require('../../config');

const createUser = async (email, password, fullName) => {
  const client = await pool.connect();
  try {
    // Hash password
    const saltRounds = config.security.saltRounds;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Normal user registration - always is_admin = false
    const isAdmin = false;
    
    // Insert new user
    const result = await client.query(
      'INSERT INTO users (email, password, full_name, is_admin, is_email_verified) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, created_at, is_admin, is_email_verified',
      [email, hashedPassword, fullName, isAdmin, true]
    );
    
    return result.rows[0];
  } finally {
    client.release();
  }
};

const findUserByEmail = async (email) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  } finally {
    client.release();
  }
};

const updateUserProfile = async (userId, fullName) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, updated_at',
      [fullName, userId]
    );
    
    return result.rows[0];
  } finally {
    client.release();
  }
};

const updateUserPassword = async (userId, newPassword) => {
  const client = await pool.connect();
  try {
    // Hash new password
    const saltRounds = config.security.saltRounds;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password
    await client.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, userId]
    );
  } finally {
    client.release();
  }
};

module.exports = {
  createUser,
  findUserByEmail,
  updateUserProfile,
  updateUserPassword
};