const {
  listGroups,
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupMembers,
  getGroupMessages,
  pinMessage,
  unpinAllMessages,
  muteGroup,
  getLastReadStatus,
  deleteGroup,
  getJoinedGroups,
} = require('./service');
const { ValidationError, NotFoundError } = require('../../core/error/errors');
const { sendSuccess, sendError } = require('../../core/http/response');

/**
 * GET / - List all groups with optional filters
 */
async function handleListGroups(req, res, next) {
  try {
    const { search, category, featured, trending } = req.query;

    console.log('✅ Fetching groups for user:', req.user.userId);
    const groups = await listGroups(search, category, featured, trending);
    console.log('✅ Successfully fetched groups, count:', groups.length);

    sendSuccess(res, { groups }, 200, 'Groups retrieved');
  } catch (err) {
    console.error('❌ Error fetching groups:', err);
    next(err);
  }
}

/**
 * POST /create - Create a new group
 */
async function handleCreateGroup(req, res, next) {
  try {
    const userId = req.user?.userId;
    const { name, description, category, is_public } = req.body;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const group = await createGroup(userId, name, description, category, is_public);
    sendSuccess(res, { group }, 201, 'Group created successfully');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:groupId/join - Join a group
 */
async function handleJoinGroup(req, res, next) {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await joinGroup(userId, groupId);
    sendSuccess(res, { message: 'Joined group' }, 200, 'Joined group successfully');
  } catch (err) {
    if (err instanceof NotFoundError) {
      return sendError(res, err.message, 404, 'NOT_FOUND');
    }
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:groupId/leave - Leave a group
 */
async function handleLeaveGroup(req, res, next) {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await leaveGroup(userId, groupId);
    sendSuccess(res, { message: 'Left group' }, 200, 'Left group successfully');
  } catch (err) {
    if (err instanceof NotFoundError) {
      return sendError(res, err.message, 404, 'NOT_FOUND');
    }
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * GET /:groupId/members - Get group members
 */
async function handleGetMembers(req, res, next) {
  try {
    const groupId = req.params.groupId;

    console.log('✅ Fetching members for group:', groupId, 'by user:', req.user.userId);
    const members = await getGroupMembers(groupId);
    console.log('✅ Successfully fetched group members, count:', members.length);

    sendSuccess(res, { members, member_count: members.length }, 200, 'Group members retrieved');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * GET /:groupId/messages - Get group messages with pagination
 */
async function handleGetMessages(req, res, next) {
  try {
    const groupId = req.params.groupId;
    const { page = 1, pageSize = 30 } = req.query;

    const messages = await getGroupMessages(groupId, page, pageSize);
    sendSuccess(res, { messages }, 200, 'Group messages retrieved');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:groupId/messages/:messageId/pin - Pin a message
 */
async function handlePinMessage(req, res, next) {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;
    const messageId = req.params.messageId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await pinMessage(userId, groupId, messageId);
    sendSuccess(res, { message: 'Message pinned' }, 200, 'Message pinned successfully');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:groupId/messages/unpin - Unpin all messages
 */
async function handleUnpinMessages(req, res, next) {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await unpinAllMessages(userId, groupId);
    sendSuccess(res, { message: 'All messages unpinned' }, 200, 'Messages unpinned successfully');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * POST /:groupId/mute - Mute or unmute a group
 */
async function handleMuteGroup(req, res, next) {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;
    const { mute } = req.body;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await muteGroup(userId, groupId, mute);
    sendSuccess(res, { message: mute ? 'Group muted' : 'Group unmuted' }, 200, mute ? 'Group muted successfully' : 'Group unmuted successfully');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * GET /last-read - Get last read status for all groups
 */
async function handleGetLastRead(req, res, next) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    console.log('✅ Fetching last read status for user:', userId);
    const lastRead = await getLastReadStatus(userId);
    console.log('✅ Successfully fetched last read status, count:', lastRead.length);

    sendSuccess(res, { lastRead }, 200, 'Last read status retrieved');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

/**
 * DELETE /:groupId - Delete a group (only creator)
 */
async function handleDeleteGroup(req, res, next) {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    await deleteGroup(userId, groupId);
    sendSuccess(res, { message: 'Group deleted successfully' }, 200, 'Group deleted successfully');
  } catch (err) {
    if (err instanceof NotFoundError) {
      return sendError(res, err.message, 404, 'NOT_FOUND');
    }
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 403, 'FORBIDDEN');
    }
    next(err);
  }
}

/**
 * GET /joined - Get groups user has joined
 */
async function handleGetJoinedGroups(req, res, next) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    }

    const joinedGroups = await getJoinedGroups(userId);
    sendSuccess(res, { joinedGroups }, 200, 'Joined groups retrieved');
  } catch (err) {
    if (err instanceof ValidationError) {
      return sendError(res, err.message, 400, 'VALIDATION_ERROR');
    }
    next(err);
  }
}

module.exports = {
  handleListGroups,
  handleCreateGroup,
  handleJoinGroup,
  handleLeaveGroup,
  handleGetMembers,
  handleGetMessages,
  handlePinMessage,
  handleUnpinMessages,
  handleMuteGroup,
  handleGetLastRead,
  handleDeleteGroup,
  handleGetJoinedGroups,
};
