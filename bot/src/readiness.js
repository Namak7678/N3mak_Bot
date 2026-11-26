'use strict';

function evaluateReadiness({ databaseInitialized, databaseStatus, redisConfigured, redisStatus }) {
  const checks = {
    database: databaseInitialized && databaseStatus === 'fulfilled' ? 'ready' : 'unavailable',
    redis: !redisConfigured ? 'disabled' : redisStatus === 'fulfilled' ? 'ready' : 'unavailable',
  };
  return {
    checks,
    ready: checks.database === 'ready' && checks.redis !== 'unavailable',
  };
}

module.exports = { evaluateReadiness };
