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

// Find or create Google user
const findOrCreateGoogleUser = async (email, name, googleId, picture) => {
  const client = await pool.connect();
  try {
    // Check if user already exists
    let userResult = await client.query(
      'SELECT * FROM users WHERE email = $1 OR google_id = $2',
      [email, googleId]
    );

    if (userResult.rows.length > 0) {
      // User exists, update Google ID if needed
      let user = userResult.rows[0];
      
      if (!user.google_id && googleId) {
        await client.query(
          'UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2',
          [googleId, user.id]
        );
        user.google_id = googleId;
      }

      // Update profile picture if provided and different
      if (picture && picture !== user.profile_picture) {
        await client.query(
          'UPDATE users SET profile_picture = $1, updated_at = NOW() WHERE id = $2',
          [picture, user.id]
        );
        user.profile_picture = picture;
      }

      // Ensure email is verified for Google users
      if (!user.is_email_verified) {
        await client.query(
          'UPDATE users SET is_email_verified = TRUE, updated_at = NOW() WHERE id = $2',
          [user.id]
        );
        user.is_email_verified = true;
      }

      return user;
    } else {
      // Google user registration - always is_admin = false, is_email_verified = true
      const isAdmin = false; // Google users are never admin
      
      // Create new user
      const newUser = await client.query(
        `INSERT INTO users (email, full_name, google_id, profile_picture, password, is_admin, is_email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, full_name, google_id, profile_picture, created_at, is_admin, is_email_verified`,
        [email, name, googleId, picture, '', isAdmin, true] // Google users: is_admin=false, is_email_verified=true
      );

      const createdUser = newUser.rows[0];

      // Auto-add user to the common group
      try {
        // Find the common group
        const groupRes = await client.query('SELECT id FROM groups WHERE is_common = TRUE LIMIT 1');
        if (groupRes.rows.length > 0) {
          const commonGroupId = groupRes.rows[0].id;
          await client.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [commonGroupId, createdUser.id]
          );
        } else {
          console.error('No common group found to auto-add user');
        }
      } catch (err) {
        console.error('Error adding user to common group:', err);
      }

      return createdUser;
    }
  } finally {
    client.release();
  }
};

module.exports = {
  createUser,
  findUserByEmail,
  updateUserProfile,
  updateUserPassword,
  findOrCreateGoogleUser
};