// routes/auth-routes.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const { pool } = require("../db/index"); // Import pool from db module instead of server.js

// Validate JWT_SECRET environment variable
if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required but not set. Please set JWT_SECRET in your environment variables."
  );
}

// Validate JWT_SECRET strength and security
const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be at least 32 characters long for security. Current length: " +
      jwtSecret.length
  );
}

// Check if JWT_SECRET is not a common weak value
const weakSecrets = [
  "your-default-secret-key",
  "secret",
  "password",
  "123456",
  "admin",
  "test",
  "dev",
  "development",
  "production",
  "jwt-secret",
  "my-secret",
  "default-secret",
];

if (weakSecrets.includes(jwtSecret.toLowerCase())) {
  throw new Error(
    "JWT_SECRET cannot be a common weak value. Please use a strong, randomly generated secret."
  );
}

// Check if JWT_SECRET contains only basic characters (indicates it might be weak)
if (/^[a-zA-Z0-9]+$/.test(jwtSecret) && jwtSecret.length < 64) {
  console.warn(
    "⚠️  Warning: JWT_SECRET appears to be weak. Consider using a longer, more complex secret for production."
  );
}

console.log("✅ JWT_SECRET validation passed - using secure secret");

// Enhanced middleware to authenticate JWT token with database verification
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      console.warn(
        `⚠️  HTTP request rejected: No authentication token from ${
          req.ip || req.connection.remoteAddress
        }`
      );
      return res.status(401).json({
        success: false,
        error: "Authentication token required",
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Additional security checks
    if (!decoded.userId || !decoded.email) {
      console.warn(
        `⚠️  HTTP request rejected: Invalid token payload from ${
          req.ip || req.connection.remoteAddress
        }`
      );
      return res.status(403).json({
        success: false,
        error: "Invalid token payload",
      });
    }

    // Check if user exists in database (enhanced security)
    let client;
    try {
      client = await pool.connect();
      const { rows } = await client.query(
        "SELECT id, email, is_email_verified, is_admin FROM users WHERE id = $1",
        [decoded.userId]
      );

      if (rows.length === 0) {
        console.warn(
          `⚠️  HTTP request rejected: User not found in database from ${
            req.ip || req.connection.remoteAddress
          }`
        );
        return res.status(403).json({
          success: false,
          error: "User not found",
        });
      }

      // Check if email is verified (enhanced security)
      if (!rows[0].is_email_verified) {
        console.warn(
          `⚠️  HTTP request rejected: Email not verified from ${
            req.ip || req.connection.remoteAddress
          }`
        );
        return res.status(403).json({
          success: false,
          error: "Email not verified",
        });
      }

      // Attach enhanced user info to request
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        isEmailVerified: rows[0].is_email_verified,
        isAdmin: rows[0].is_admin || false,
      };

      // Add request metadata for audit purposes
      req.requestMetadata = {
        timestamp: new Date(),
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"],
        method: req.method,
        path: req.path,
      };

      console.log(
        `✅ HTTP authenticated: User ${decoded.userId} (${
          decoded.email
        }) from ${req.ip || req.connection.remoteAddress} - ${req.method} ${
          req.path
        }`
      );
      next();
    } catch (dbError) {
      console.error("Database error during HTTP authentication:", dbError);
      return res.status(503).json({
        success: false,
        error: "Authentication service unavailable",
      });
    } finally {
      if (client) client.release();
    }
  } catch (error) {
    console.warn(
      `⚠️  HTTP authentication failed from ${
        req.ip || req.connection.remoteAddress
      }:`,
      error.message
    );
    return res.status(403).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
}

// Middleware to validate email format
const validateEmail = (req, res, next) => {
  const { email } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: "Invalid email format",
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
      error: "Password must be at least 8 characters long",
    });
  }

  next();
};

// Register user
router.post("/register", validateEmail, async (req, res) => {
  let client;
  try {
    const { email, password, full_name } = req.body;

    // Get a client from the pool
    client = await pool.connect();

    // Check if user already exists
    const existingUser = await client.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "User with this email already exists",
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Normal user registration - always is_admin = false
    const isAdmin = false; // Normal users are never admin

    // Insert new user
    const result = await client.query(
      "INSERT INTO users (email, password, full_name, is_admin, is_email_verified) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, created_at, is_admin, is_email_verified",
      [email, hashedPassword, full_name, isAdmin, true] // Normal users: is_admin=false, is_email_verified=true
    );

    if (!result?.rows?.[0]) {
      throw new Error("User insertion did not return expected data");
    }

    // Auto-add user to the common group
    try {
      // Find the common group
      const groupRes = await client.query(
        "SELECT id FROM groups WHERE is_common = TRUE LIMIT 1"
      );
      if (groupRes.rows.length > 0) {
        const commonGroupId = groupRes.rows[0].id;
        await client.query(
          "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [commonGroupId, result.rows[0].id]
        );
      } else {
        console.error("No common group found to auto-add user");
      }
    } catch (err) {}

    // Generate JWT token for the newly registered user
    const token = jwt.sign(
      { userId: result.rows[0].id, email: result.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "24h" }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      {
        userId: result.rows[0].id,
        email: result.rows[0].email,
        type: "refresh",
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "7d" }
    );

    // Calculate expiry time in seconds
    const expiresIn = process.env.JWT_EXPIRE === "24h" ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        accessToken: token,
        refreshToken: refreshToken,
        expiresIn: expiresIn,
        token: token, // Keep for backward compatibility
        user: result.rows[0],
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      error: "Registration failed. Please try again later.",
    });
  } finally {
    if (client) client.release(); // Always release the client back to the pool
  }
});

// Login user
router.post("/login", validateEmail, async (req, res) => {
  let client;
  try {
    const { email, password } = req.body;

    // Get a client from the pool
    client = await pool.connect();

    // Find user by email
    const result = await client.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (!result || result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    const user = result.rows[0];

    // Ensure that user.password is a hashed value and not undefined
    if (!user?.password) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials (password not found)",
      });
    }

    // Debug: Log the password comparison
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user?.id, email: user?.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "24h" }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { userId: user?.id, email: user?.email, type: "refresh" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "7d" }
    );

    // Calculate expiry time in seconds
    const expiresIn = process.env.JWT_EXPIRE === "24h" ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

    res.json({
      success: true,
      message: "Login successful",
      data: {
        accessToken: token,
        refreshToken: refreshToken,
        expiresIn: expiresIn,
        token: token, // Keep for backward compatibility
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
        },
      },
    });
  } catch (error) {
    console.error("Error in route:", error);
    res.status(500).json({
      success: false,
      error: "Login failed",
    });
  } finally {
    if (client) client.release(); // Always release the client back to the pool
  }
});

// Refresh token endpoint
router.post("/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: "Refresh token is required",
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Check if it's a refresh token
    if (decoded.type !== "refresh") {
      return res.status(403).json({
        success: false,
        error: "Invalid token type",
      });
    }

    // Check if user exists in database
    let client;
    try {
      client = await pool.connect();
      const { rows } = await client.query(
        "SELECT id, email, is_email_verified FROM users WHERE id = $1",
        [decoded.userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: "User not found",
        });
      }

      // Check if email is verified
      if (!rows[0].is_email_verified) {
        return res.status(403).json({
          success: false,
          error: "Email not verified",
        });
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        { userId: decoded.userId, email: decoded.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || "24h" }
      );

      // Generate new refresh token
      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, email: decoded.email, type: "refresh" },
        process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "7d" }
      );

      // Calculate expiry time in seconds
      const expiresIn = process.env.JWT_EXPIRE === "24h" ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

      res.json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: expiresIn,
        },
      });
    } finally {
      if (client) client.release();
    }
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired refresh token",
    });
  }
});

// Get current user profile
router.get("/profile", authenticateToken, async (req, res) => {
  let client;
  try {
    client = await pool.connect();

    const result = await client.query(
      "SELECT id, email, full_name, created_at FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in route:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user profile",
    });
  } finally {
    if (client) client.release();
  }
});

// Update user profile
router.put("/profile", authenticateToken, async (req, res) => {
  let client;
  try {
    const { full_name } = req.body;

    if (!full_name) {
      return res.status(400).json({
        success: false,
        error: "Full name is required",
      });
    }

    client = await pool.connect();

    const result = await client.query(
      "UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, updated_at",
      [full_name, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error in route:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update profile",
    });
  } finally {
    if (client) client.release();
  }
});

// Change password
router.put(
  "/change-password",
  authenticateToken,
  validatePassword,
  async (req, res) => {
    let client;
    try {
      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        return res.status(400).json({
          success: false,
          error: "Current password and new password are required",
        });
      }

      client = await pool.connect();

      // Get user with password
      const userResult = await client.query(
        "SELECT password FROM users WHERE id = $1",
        [req.user.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
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
          error: "Current password is incorrect",
        });
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(new_password, saltRounds);

      // Update password
      await client.query(
        "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2",
        [hashedPassword, req.user.userId]
      );

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Error in route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to change password",
      });
    } finally {
      if (client) client.release();
    }
  }
);

// Change password
router.put(
  "/change-password",
  authenticateToken,
  validatePassword,
  async (req, res) => {
    let client;
    try {
      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        return res.status(400).json({
          success: false,
          error: "Current password and new password are required",
        });
      }

      client = await pool.connect();

      // Get user with password
      const userResult = await client.query(
        "SELECT password FROM users WHERE id = $1",
        [req.user.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
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
          error: "Current password is incorrect",
        });
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(new_password, saltRounds);

      // Update password
      await client.query(
        "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2",
        [hashedPassword, req.user.userId]
      );

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      console.error("Error in route:", error);
      res.status(500).json({
        success: false,
        error: "Failed to change password",
      });
    } finally {
      if (client) client.release();
    }
  }
);

// Forgot password - generate and send verification code
router.post("/forgot-password", validateEmail, async (req, res) => {
  let client;
  try {
    const { email } = req.body;

    client = await pool.connect();

    // Check if user exists
    const userResult = await client.query(
      "SELECT id, email, full_name FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      // For security, we don't reveal if the email exists
      return res.json({
        success: true,
        message:
          "If your email is registered, you will receive a verification code shortly.",
      });
    }

    const user = userResult.rows[0];

    // Generate 6-digit verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Hash the verification code for storage
    const saltRounds = 10;
    const hashedCode = await bcrypt.hash(verificationCode, saltRounds);

    // Store the hashed code and expiry (15 minutes)
    await client.query(
      "UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3",
      [hashedCode, new Date(Date.now() + 15 * 60 * 1000), user.id]
    );

    // Send email with verification code using Brevo
    try {
      const brevo = require("@getbrevo/brevo");
      const apiInstance = new brevo.TransactionalEmailsApi();

      const apiKey = apiInstance.authentications["apiKey"];
      apiKey.apiKey = process.env.BREVO_API_KEY;

      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.subject = "Talktivity Password Reset Verification Code";
      sendSmtpEmail.htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6A5AE0;">Password Reset Request</h2>
          <p>Hello ${user.full_name || "User"},</p>
          <p>You have requested to reset your password. Please use the following verification code to proceed:</p>
          <div style="background-color: #f5f5f5; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${verificationCode}
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you did not request this password reset, please ignore this email.</p>
          <br>
          <p>Best regards,<br>The Talkitivity Team</p>
        </div>
      `;
      sendSmtpEmail.sender = {
        name: process.env.BREVO_SENDER_NAME,
        email: process.env.BREVO_SENDER_EMAIL,
      };
      sendSmtpEmail.to = [
        { email: user.email, name: user.full_name || "User" },
      ];

      await apiInstance.sendTransacEmail(sendSmtpEmail);

      res.json({
        success: true,
        message:
          "If your email is registered, you will receive a verification code shortly.",
      });
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
      res.status(500).json({
        success: false,
        error: "Failed to send verification email. Please try again later.",
      });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      error:
        "Failed to process forgot password request. Please try again later.",
    });
  } finally {
    if (client) client.release();
  }
});

// Verify code and reset password
router.post("/reset-password", validatePassword, async (req, res) => {
  let client;
  try {
    const { email, verificationCode, password } = req.body;
    console.log("Reset password request received:", {
      email,
      verificationCode,
      password,
    });

    client = await pool.connect();

    // Get user with reset token
    const userResult = await client.query(
      "SELECT id, reset_token, reset_token_expiry FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const user = userResult.rows[0];

    // Check if reset token exists
    if (!user.reset_token) {
      return res.status(400).json({
        success: false,
        error:
          "No password reset request found. Please request a new verification code.",
      });
    }

    // Check if token has expired
    if (new Date() > new Date(user.reset_token_expiry)) {
      return res.status(400).json({
        success: false,
        error: "Verification code has expired. Please request a new one.",
      });
    }

    // Verify the code
    const isCodeValid = await bcrypt.compare(
      verificationCode,
      user.reset_token
    );

    if (!isCodeValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid verification code",
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update password and clear reset token
    await client.query(
      "UPDATE users SET password = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2",
      [hashedPassword, user.id]
    );

    res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset password. Please try again later.",
    });
  } finally {
    if (client) client.release();
  }
});

// Admin authorization middleware
async function requireAdmin(req, res, next) {
  try {
    // First ensure user is authenticated
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    let client;
    try {
      client = await pool.connect();

      // Check if user has admin privileges
      const { rows } = await client.query(
        "SELECT is_admin FROM users WHERE id = $1",
        [req.user.userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      if (!rows[0].is_admin) {
        console.warn(
          `⚠️  Unauthorized admin access attempt: User ${req.user.userId} (${
            req.user.email
          }) from ${req.ip || req.connection.remoteAddress}`
        );
        return res.status(403).json({
          success: false,
          error: "Admin privileges required",
        });
      }

      console.log(
        `✅ Admin access granted: User ${req.user.userId} (${
          req.user.email
        }) from ${req.ip || req.connection.remoteAddress}`
      );
      next();
    } finally {
      if (client) client.release();
    }
  } catch (error) {
    console.error("Error in admin authorization:", error);
    res.status(500).json({
      success: false,
      error: "Authorization service unavailable",
    });
  }
}

// Admin registration with token validation
router.post("/admin-register", async (req, res) => {
  let client;
  try {
    const { email, password, full_name, adminToken } = req.body;

    // Validate required fields
    if (!email || !password || !full_name || !adminToken) {
      return res.status(400).json({
        success: false,
        error: "All fields are required",
      });
    }

    // Validate admin token
    const expectedAdminToken = process.env.ADMIN_SETUP_TOKEN;
    if (!expectedAdminToken) {
      console.error("ADMIN_SETUP_TOKEN not configured in environment");
      return res.status(500).json({
        success: false,
        error: "Admin setup not configured",
      });
    }

    if (adminToken !== expectedAdminToken) {
      console.warn(
        `⚠️  Invalid admin setup token attempt from ${
          req.ip || req.connection.remoteAddress
        }`
      );
      return res.status(403).json({
        success: false,
        error: "Invalid admin setup token",
      });
    }

    // Check if admin already exists
    client = await pool.connect();
    const existingAdmin = await client.query(
      "SELECT id FROM users WHERE is_admin = true LIMIT 1"
    );

    if (existingAdmin.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Admin account already exists",
      });
    }

    // Check if email already exists
    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "User with this email already exists",
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create admin user
    const result = await client.query(
      "INSERT INTO users (email, password, full_name, is_admin, is_email_verified) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, created_at",
      [email, hashedPassword, full_name, true, true] // Admin users are automatically email verified
    );

    if (!result?.rows?.[0]) {
      throw new Error("Admin user creation failed");
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.rows[0].id, email: result.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "24h" }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      {
        userId: result.rows[0].id,
        email: result.rows[0].email,
        type: "refresh",
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "7d" }
    );

    // Calculate expiry time in seconds
    const expiresIn = process.env.JWT_EXPIRE === "24h" ? 24 * 60 * 60 : 86400; // Default to 24 hours in seconds

    console.log(
      `✅ Admin account created: ${email} from ${
        req.ip || req.connection.remoteAddress
      }`
    );

    res.status(201).json({
      success: true,
      message: "Admin account created successfully",
      data: {
        accessToken: token,
        refreshToken: refreshToken,
        expiresIn: expiresIn,
        token: token, // Keep for backward compatibility
        user: result.rows[0],
      },
    });
  } catch (error) {
    console.error("Admin registration error:", error);
    res.status(500).json({
      success: false,
      error: "Admin registration failed. Please try again later.",
    });
  } finally {
    if (client) client.release();
  }
});

// Validate admin setup token
router.post("/validate-admin-token", async (req, res) => {
  try {
    const { adminToken } = req.body;

    if (!adminToken) {
      return res.status(400).json({
        success: false,
        error: "Admin token is required",
      });
    }

    const expectedAdminToken = process.env.ADMIN_SETUP_TOKEN;
    if (!expectedAdminToken) {
      return res.status(500).json({
        success: false,
        error: "Admin setup not configured",
      });
    }

    const isValid = adminToken === expectedAdminToken;

    // Check if admin already exists
    let client;
    try {
      client = await pool.connect();
      const existingAdmin = await client.query(
        "SELECT id FROM users WHERE is_admin = true LIMIT 1"
      );

      if (existingAdmin.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Admin account already exists",
        });
      }
    } finally {
      if (client) client.release();
    }

    res.json({
      success: true,
      isValid,
      message: isValid ? "Valid admin token" : "Invalid admin token",
    });
  } catch (error) {
    console.error("Admin token validation error:", error);
    res.status(500).json({
      success: false,
      error: "Token validation failed",
    });
  }
});

// Export router and middleware for use in other files
module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireAdmin = requireAdmin;
