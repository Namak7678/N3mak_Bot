'use strict';

const ROLE_CAPABILITIES = Object.freeze({
  orchestrator: ['task:read', 'task:delegate', 'report:draft'],
  researcher: ['knowledge:read', 'web:search', 'evidence:attach'],
  analyst: ['knowledge:read', 'evidence:verify', 'report:draft'],
  developer: ['repo:read', 'tests:run', 'code:propose'],
  reviewer: ['knowledge:read', 'evidence:verify', 'audit:read'],
  secretary: ['task:read', 'report:draft'],
  marketing: ['knowledge:read', 'content:draft'],
  support: ['knowledge:read', 'customer:reply_draft'],
});

const TOOL_RISK = Object.freeze({
  'task:read': 'read',
  'task:delegate': 'internal',
  'report:draft': 'draft',
  'knowledge:read': 'read',
  'web:search': 'read',
  'evidence:attach': 'internal',
  'evidence:verify': 'internal',
  'repo:read': 'read',
  'tests:run': 'internal',
  'code:propose': 'draft',
  'audit:read': 'read',
  'content:draft': 'draft',
  'customer:reply_draft': 'draft',
  'message:send': 'external',
  'content:publish': 'external',
  'payment:charge': 'financial',
  'payment:refund': 'financial',
  'account:change': 'sensitive',
  'repository:write': 'sensitive',
  'deployment:execute': 'sensitive',
});

const KNOWN_ROLES = Object.freeze(Object.keys(ROLE_CAPABILITIES));

function getRoleCapabilities(role) {
  return ROLE_CAPABILITIES[role] ? [...ROLE_CAPABILITIES[role]] : [];
}

module.exports = { ROLE_CAPABILITIES, TOOL_RISK, KNOWN_ROLES, getRoleCapabilities };
