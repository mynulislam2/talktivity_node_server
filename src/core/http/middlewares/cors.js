// src/core/http/middlewares/cors.js
// CORS middleware configuration

const cors = require('cors');
const { config } = require('../../../config');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = config.cors.allowedOrigins;
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

const corsMiddleware = cors(corsOptions);

// Export the allowed origins for use in other modules (like Socket.IO)
const getAllowedOrigins = () => {
  return config.cors.allowedOrigins;
};

module.exports = { corsMiddleware, getAllowedOrigins };