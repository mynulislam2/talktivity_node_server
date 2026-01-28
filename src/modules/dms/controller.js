const {
  listDMs,
  startDM,
  getDMMessages,
  markDMAsRead,
  pinDMMessage,
  unpinAllDMMessages,
  archiveDM,
} = require('./service');
const { ValidationError, NotFoundError } = require('../../core/error/errors');
const { sendSuccess, sendError } = require('../../core/http/response');

/**
 * GET / - List all DMs for the authenticated user
 */
async function getDMList(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    console.log('✅ Fetching DMs for user:', userId);
    const dms = await listDMs(userId);
    console.log('✅ Successfully fetched DMs, count:', dms.length);
    sendSuccess(res, { dms }, 200, 'DMs retrieved');
  } catch (err) {
    console.error('❌ Error fetching DMs:', err);
    next(err);
  }
}

/**
 * POST /start - Start a new DM conversation
 */
async function createDM(req, res, next) {
  try {
    const userId = req.user?.userId;
    const { otherUserId } = req.body;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    if (!otherUserId) {
      return sendError(res, 'Other user ID is required', 400, 'VALIDATION_ERROR');
    }

    const dmId = await startDM(userId, otherUserId);
    sendSuccess(res, { dmId }, 201, 'DM conversation started');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * GET /:dmId/messages - Get messages from a DM with pagination
 */
async function getMessages(req, res, next) {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;
    const { page = 1, pageSize = 30 } = req.query;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const messages = await getDMMessages(userId, dmId, page, pageSize);
    sendSuccess(res, { messages }, 200, 'Messages retrieved');
  } catch (err) {
    if (err instanceof NotFoundError) {
      return sendError(res, err.message, 403, 'NOT_FOUND');
    }
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:dmId/read - Mark a DM as read
 */
async function markAsRead(req, res, next) {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await markDMAsRead(userId, dmId);
    sendSuccess(res, { message: 'Marked as read' }, 200, 'DM marked as read');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:dmId/messages/:messageId/pin - Pin a message
 */
async function pinMessage(req, res, next) {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;
    const messageId = req.params.messageId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await pinDMMessage(userId, dmId, messageId);
    sendSuccess(res, { message: 'Message pinned' }, 200, 'Message pinned');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:dmId/messages/unpin - Unpin all messages
 */
async function unpinMessages(req, res, next) {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await unpinAllDMMessages(userId, dmId);
    sendSuccess(res, { message: 'All messages unpinned' }, 200, 'Messages unpinned');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:dmId/archive - Archive a DM
 */
async function archive(req, res, next) {
  try {
    const userId = req.user?.userId;
    const dmId = req.params.dmId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await archiveDM(userId, dmId);
    sendSuccess(res, { message: 'Conversation archived' }, 200, 'DM archived');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

module.exports = {
  getDMList,
  createDM,
  getMessages,
  markAsRead,
  pinMessage,
  unpinMessages,
  archive,
};
