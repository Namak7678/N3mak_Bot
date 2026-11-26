'use strict';

const { ROLE_CAPABILITIES, TOOL_RISK } = require('./registry');

const DENY_BY_DEFAULT = Object.freeze([
  'message:send',
  'content:publish',
  'payment:charge',
  'payment:refund',
  'account:change',
  'repository:write',
  'deployment:execute',
]);

function evaluateToolRequest({ role, tool, task, approval, now = new Date() } = {}) {
  const deny = (reason) => ({ allowed: false, reason });
  if (!role || !ROLE_CAPABILITIES[role]) return deny('unknown_role');
  if (!task || !Array.isArray(task.roles) || !task.roles.includes(role)) return deny('role_not_assigned_to_task');
  if (typeof tool !== 'string' || !TOOL_RISK[tool]) return deny('unknown_tool');
  if (!Array.isArray(task.allowedTools) || !task.allowedTools.includes(tool)) return deny('tool_not_allowed_by_task');
  if (!ROLE_CAPABILITIES[role].includes(tool)) return deny('tool_not_allowed_for_role');

  const risk = TOOL_RISK[tool];
  if (DENY_BY_DEFAULT.includes(tool)) {
    if (!approval || approval.status !== 'approved') return deny('human_approval_required');
    if (approval.taskId !== task.taskId || approval.tool !== tool) return deny('approval_scope_mismatch');
    if (typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim()) return deny('approval_missing_actor');
    const expiresAt = Date.parse(approval.expiresAt);
    const approvedAt = Date.parse(approval.approvedAt);
    const currentTime = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!Number.isFinite(expiresAt) || !Number.isFinite(approvedAt) ||
        approvedAt > currentTime || expiresAt <= currentTime) return deny('approval_expired_or_invalid');
    return { allowed: true, reason: 'approved_by_human', risk };
  }

  return { allowed: true, reason: 'allowed_by_task_and_role', risk };
}

module.exports = { DENY_BY_DEFAULT, evaluateToolRequest };
