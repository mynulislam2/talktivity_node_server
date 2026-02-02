/**
 * Roleplays Module Controller
 */

const { sendSuccess, sendError } = require('../../core/http/response');
const roleplaysService = require('./service');

const roleplaysController = {
  async listRoleplays(req, res, next) {
    try {
      const userId = req.user.userId;
      const roleplays = await roleplaysService.listUserRoleplays(userId);
      sendSuccess(res, roleplays, 200, 'Roleplays retrieved');
    } catch (error) {
      next(error);
    }
  },

  async createRoleplay(req, res, next) {
    try {
      const userId = req.user.userId;
      const { title, prompt, firstPrompt, myRole, otherRole, situation, imageUrl } = req.body || {};

      if (!title || !prompt || !firstPrompt || !myRole || !otherRole || !situation) {
        return sendError(res, 'Missing required fields', 400);
      }

      const created = await roleplaysService.createUserRoleplay(userId, {
        title,
        prompt,
        firstPrompt,
        myRole,
        otherRole,
        situation,
        imageUrl: imageUrl || null,
      });

      sendSuccess(res, created, 201, 'Roleplay created successfully');
    } catch (error) {
      next(error);
    }
  },

  async deleteRoleplay(req, res, next) {
    try {
      const userId = req.user.userId;
      const { roleplayId } = req.params;

      if (!roleplayId) {
        return sendError(res, 'roleplayId is required', 400);
      }

      await roleplaysService.deleteUserRoleplay(userId, roleplayId);
      sendSuccess(res, { deleted: true }, 200, 'Roleplay deleted');
    } catch (error) {
      next(error);
    }
  },
};

module.exports = roleplaysController;

