// src/modules/groups/service.js
// Groups business logic

const { 
  getAllGroups,
  createGroup,
  joinGroup,
  leaveGroup,
  getGroupMembers,
  getJoinedGroups,
  deleteGroup
} = require('./repo');

const listGroups = async (search, category, featured, trending) => {
  return await getAllGroups(search, category, featured, trending);
};

const createNewGroup = async (name, description, category, isPublic, createdBy) => {
  if (!name || typeof name !== "string" || name.trim() === "") {
    throw new Error("Group name is required");
  }
  
  return await createGroup(name, description, category, isPublic, createdBy);
};

const joinExistingGroup = async (groupId, userId) => {
  return await joinGroup(groupId, userId);
};

const leaveExistingGroup = async (groupId, userId) => {
  return await leaveGroup(groupId, userId);
};

const fetchGroupMembers = async (groupId) => {
  return await getGroupMembers(groupId);
};

const fetchJoinedGroups = async (userId) => {
  return await getJoinedGroups(userId);
};

const removeGroup = async (groupId, userId) => {
  return await deleteGroup(groupId, userId);
};

module.exports = {
  listGroups,
  createNewGroup,
  joinExistingGroup,
  leaveExistingGroup,
  fetchGroupMembers,
  fetchJoinedGroups,
  removeGroup
};