// src/modules/groups/controller.js
// Groups request handlers

const { 
  listGroups,
  createNewGroup,
  joinExistingGroup,
  leaveExistingGroup,
  fetchGroupMembers,
  fetchJoinedGroups,
  removeGroup
} = require('./service');

const { successResponse, errorResponse } = require('../../core/http/response');

// List all groups (with search/filter)
const list = async (req, res) => {
  try {
    const { search, category, featured, trending } = req.query;
    
    console.log("✅ Fetching groups for user:", req.user.userId);
    const groups = await listGroups(search, category, featured, trending);
    
    console.log("✅ Successfully fetched groups, count:", groups.length);
    res.json(successResponse({ groups }));
  } catch (err) {
    console.error("❌ Error fetching groups:", err);
    res.status(500).json(errorResponse(err, "Unable to retrieve groups at this time. Please try again later."));
  }
};

// Create a new public group
const create = async (req, res) => {
  try {
    const { name, description, category, is_public } = req.body;
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }
    
    const group = await createNewGroup(name, description, category, is_public, userId);
    
    res.status(201).json(successResponse({ group }, "Group created successfully"));
  } catch (err) {
    console.error("Error creating group:", err);
    res.status(500).json(errorResponse(err, "Unable to create group at this time. Please try again later."));
  }
};

// Join a group
const join = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;
    
    if (!userId) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }
    
    await joinExistingGroup(groupId, userId);
    
    res.json(successResponse(null, "Joined group"));
  } catch (err) {
    console.error("Error joining group:", err);
    res.status(500).json(errorResponse(err, "Unable to join group at this time. Please try again later."));
  }
};

// Leave a group
const leave = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;
    
    if (!userId) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }
    
    await leaveExistingGroup(groupId, userId);
    
    res.json(successResponse(null, "Left group"));
  } catch (err) {
    console.error("Error leaving group:", err);
    res.status(500).json(errorResponse(err, "Unable to leave group at this time. Please try again later."));
  }
};

// Get group members
const getMembers = async (req, res) => {
  try {
    const groupId = req.params.groupId;
    
    console.log("✅ Fetching members for group:", groupId, "by user:", req.user.userId);
    const result = await fetchGroupMembers(groupId);
    
    console.log("✅ Successfully fetched group members, count:", result.members.length);
    res.json(successResponse(result));
  } catch (err) {
    console.error("❌ Error fetching group members:", err);
    res.status(500).json(errorResponse(err, "Unable to retrieve group members at this time. Please try again later."));
  }
};

// Get groups the user has joined
const getJoined = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }
    
    const joinedGroups = await fetchJoinedGroups(userId);
    
    res.json(successResponse({ joinedGroups }));
  } catch (err) {
    console.error("Error fetching joined groups:", err);
    res.status(500).json(errorResponse(err, "Unable to retrieve joined groups."));
  }
};

// Delete a group (only creator can delete)
const remove = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;
    
    if (!userId) {
      return res.status(401).json(errorResponse("Unauthorized"));
    }
    
    await removeGroup(groupId, userId);
    
    res.json(successResponse(null, "Group deleted successfully"));
  } catch (err) {
    console.error("Error deleting group:", err);
    res.status(500).json(errorResponse(err, "Unable to delete group at this time. Please try again later."));
  }
};

module.exports = {
  list,
  create,
  join,
  leave,
  getMembers,
  getJoined,
  remove
};