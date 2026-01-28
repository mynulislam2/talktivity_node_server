/**
 * Response Helper
 */

const sendResponse = (res, statusCode = 200, data = null, message = null) => {
  const response = {
    success: statusCode < 400,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: res.req?.id,
    },
  };

  if (message) {
    response.message = message;
  }

  res.status(statusCode).json(response);
};

const sendSuccess = (res, data, statusCode = 200, message = null) => {
  sendResponse(res, statusCode, data, message);
};

const sendError = (res, error, statusCode = 500, code = 'ERROR') => {
  res.status(statusCode).json({
    success: false,
    error,
    code,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: res.req?.id,
    },
  });
};

module.exports = { sendResponse, sendSuccess, sendError };
