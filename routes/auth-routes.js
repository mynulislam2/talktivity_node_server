// routes/auth-routes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { pool } = require('../db/index'); // Import pool from db module instead of server.js

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication token required'
    });
  }
  
  jwt.verify(token, process.env.JWT_SECRET || 'your-default-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
    
    req.user = user;
    next();
  });
}

// Middleware to validate email format
const validateEmail = (req, res, next) => {
  const { email } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format'
    });
  }
  
  next();
};

// Middleware to validate password strength
const validatePassword = (req, res, next) => {
  const { password } = req.body;
  
  if (!password || password.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters long'
    });
  }
  
  next();
};

// Register a new user
router.post('/register', validateEmail, validatePassword, async (req, res) => {
  let client;
  try {
    const { email, password, full_name } = req.body;
    
    // Get a client from the pool
    client = await pool.connect();
    
    // Check if user already exists
    const userCheck = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (userCheck?.rows?.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered'
      });
    }
    
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Insert new user
    const result = await client.query(
      'INSERT INTO users (email, password, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, created_at',
      [email, hashedPassword, full_name]
    );
    
    if (!result?.rows?.[0]) {
      throw new Error('User insertion did not return expected data');
    }

    // Auto-add user to the common group
    try {
      // Find the common group
      const groupRes = await client.query('SELECT id FROM groups WHERE is_common = TRUE LIMIT 1');
      if (groupRes.rows.length > 0) {
        const commonGroupId = groupRes.rows[0].id;
        await client.query(
          'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [commonGroupId, result.rows[0].id]
        );
      } else {
        console.error('No common group found to auto-add user');
      }
    } catch (err) {
      console.error('Error auto-adding user to common group:', err.message);
    }
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: result.rows[0]
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Registration failed: ${error.message}`
    });
  } finally {
    if (client) client.release(); // Always release the client back to the pool
  }
});

// Login user
router.post('/login', validateEmail, async (req, res) => {
  let client;
  try {
    const { email, password, fingerprint_id } = req.body;

    // Get a client from the pool
    client = await pool.connect();

    // Find user by email
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);

    if (!result || result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const user = result.rows[0];

    // Ensure that user.password is a hashed value and not undefined
    if (!user?.password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials (password not found)'
      });
    }

    // Debug: Log the password comparison
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update user's fingerprint_id if provided
    if (fingerprint_id && fingerprint_id !== user.fingerprint_id) {
      await client.query(
        'UPDATE users SET fingerprint_id = $1, updated_at = NOW() WHERE id = $2',
        [fingerprint_id, user.id]
      );
      console.log(`Updated fingerprint_id for user ${user.id}: ${fingerprint_id}`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user?.id, email: user?.email },
      process.env.JWT_SECRET || 'your-default-secret-key',
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          fingerprint_id: fingerprint_id || user.fingerprint_id
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  } finally {
    if (client) client.release(); // Always release the client back to the pool
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    
    const result = await client.query(
      'SELECT id, email, full_name, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile'
    });
  } finally {
    if (client) client.release();
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  let client;
  try {
    const { full_name } = req.body;
    
    if (!full_name) {
      return res.status(400).json({
        success: false,
        error: 'Full name is required'
      });
    }
    
    client = await pool.connect();
    
    const result = await client.query(
      'UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, updated_at',
      [full_name, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  } finally {
    if (client) client.release();
  }
});

// Change password
router.put('/change-password', authenticateToken, validatePassword, async (req, res) => {
  let client;
  try {
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }
    
    client = await pool.connect();
    
    // Get user with password
    const userResult = await client.query(
      'SELECT password FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      current_password, 
      userResult.rows[0].password
    );
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(new_password, saltRounds);
    
    // Update password
    await client.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.userId]
    );
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  } finally {
    if (client) client.release();
  }
});

// Export router and authenticateToken middleware for use in other files
module.exports = router;
module.exports.authenticateToken = authenticateToken;