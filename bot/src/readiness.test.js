'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReadiness } = require('./readiness');

test('readiness stays false until database schema initialization completes', () => {
  const result = evaluateReadiness({
    databaseInitialized: false,
    databaseStatus: 'fulfilled',
    redisConfigured: true,
    redisStatus: 'fulfilled',
  });
  assert.equal(result.ready, false);
  assert.equal(result.checks.database, 'unavailable');
});

test('readiness succeeds after database initialization and configured Redis respond', () => {
  const result = evaluateReadiness({
    databaseInitialized: true,
    databaseStatus: 'fulfilled',
    redisConfigured: true,
    redisStatus: 'fulfilled',
  });
  assert.equal(result.ready, true);
});

test('readiness fails when the database query fails', () => {
  const result = evaluateReadiness({
    databaseInitialized: true,
    databaseStatus: 'rejected',
    redisConfigured: false,
    redisStatus: 'fulfilled',
  });
  assert.equal(result.ready, false);
});

test('unconfigured Redis is optional, but configured unhealthy Redis blocks readiness', () => {
  const optional = evaluateReadiness({
    databaseInitialized: true,
    databaseStatus: 'fulfilled',
    redisConfigured: false,
    redisStatus: 'fulfilled',
  });
  const unhealthy = evaluateReadiness({
    databaseInitialized: true,
    databaseStatus: 'fulfilled',
    redisConfigured: true,
    redisStatus: 'rejected',
  });
  assert.equal(optional.ready, true);
  assert.equal(optional.checks.redis, 'disabled');
  assert.equal(unhealthy.ready, false);
  assert.equal(unhealthy.checks.redis, 'unavailable');
});
