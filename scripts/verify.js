#!/usr/bin/env node
/**
 * N3mak Bot — Local verification & setup helper
 *
 * What this does:
 *   1. Verifies your Node.js version (>= 18)
 *   2. Checks for required environment variables
 *   3. Tests connectivity to Telegram Bot API (validates your token)
 *   4. Tests connectivity to Postgres (if DATABASE_URL is set)
 *   5. Tests connectivity to Redis (if REDIS_URL is set)
 *   6. Runs the smoke test suite
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxx DATABASE_URL=... REDIS_URL=... node scripts/verify.js
 *
 * Or with a .env file present in the repo root:
 *   node scripts/verify.js
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

// Try to load .env if dotenv is available
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {
  // dotenv is a dependency, so this should always succeed
}

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const results = { passed: 0, failed: 0, warnings: 0 };

function pass(label, detail = '') {
  console.log(`  ${colors.green('✓')} ${label}${detail ? ` ${colors.cyan(detail)}` : ''}`);
  results.passed++;
}
function fail(label, detail = '') {
  console.log(`  ${colors.red('✗')} ${label}${detail ? `\n      ${colors.red(detail)}` : ''}`);
  results.failed++;
}
function warn(label, detail = '') {
  console.log(`  ${colors.yellow('!')} ${label}${detail ? ` ${colors.yellow(detail)}` : ''}`);
  results.warnings++;
}

function httpsGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function checkNode() {
  console.log(`\n${colors.bold('1) Runtime check')}`);
  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 18) pass(`Node.js ${process.versions.node} (>= 18 required)`);
  else fail(`Node.js ${process.versions.node} — must be >= 18`);
}

async function checkEnv() {
  console.log(`\n${colors.bold('2) Environment variables')}`);
  const required = ['TELEGRAM_BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL'];
  for (const key of required) {
    const v = process.env[key];
    if (!v) {
      fail(`${key} is not set`);
    } else if (v.includes('your_') || v.includes('xxx') || v.length < 10) {
      warn(`${key} looks like a placeholder`, `value starts with "${v.slice(0, 12)}..."`);
    } else {
      pass(`${key} is set`, `(len=${v.length})`);
    }
  }
  if (!process.env.PUBLIC_URL) {
    warn('PUBLIC_URL is not set', 'Bot will use polling (fine for local dev)');
  } else {
    pass('PUBLIC_URL is set', process.env.PUBLIC_URL);
  }
}

async function checkTelegram() {
  console.log(`\n${colors.bold('3) Telegram Bot API')}`);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.includes('your_')) {
    fail('Skipped — TELEGRAM_BOT_TOKEN is not set or is a placeholder');
    return;
  }
  try {
    const res = await httpsGet(`https://api.telegram.org/bot${token}/getMe`);
    if (res.status === 200 && res.body.ok) {
      pass('Telegram API reachable', `@${res.body.result.username} (id=${res.body.result.id})`);
    } else {
      fail(`Telegram API returned status ${res.status}`, JSON.stringify(res.body).slice(0, 200));
    }
  } catch (err) {
    fail('Cannot reach Telegram API', err.message);
  }
}

async function checkPostgres() {
  console.log(`\n${colors.bold('4) Postgres connection')}`);
  const url = process.env.DATABASE_URL;
  if (!url || url.includes('user:pass')) {
    fail('Skipped — DATABASE_URL is not set or is a placeholder');
    return;
  }
  let Client;
  try { Client = require('pg').Client; }
  catch { fail('pg module not installed'); return; }
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const r = await client.query('SELECT NOW() AS now, version() AS version');
    pass('Postgres reachable', `server time = ${r.rows[0].now.toISOString()}`);
    await client.end();
  } catch (err) {
    fail('Cannot connect to Postgres', err.message);
  }
}

async function checkRedis() {
  console.log(`\n${colors.bold('5) Redis connection')}`);
  const url = process.env.REDIS_URL;
  if (!url || url.includes('host:port')) {
    fail('Skipped — REDIS_URL is not set or is a placeholder');
    return;
  }
  let Redis;
  try { Redis = require('ioredis').default || require('ioredis'); }
  catch { fail('ioredis module not installed'); return; }
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
    retryStrategy: () => null, // do not retry — fail fast
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong === 'PONG') pass('Redis reachable', `(PING → ${pong})`);
    else fail(`Redis returned unexpected response: ${pong}`);
  } catch (err) {
    fail('Cannot connect to Redis', err.message);
  } finally {
    redis.disconnect();
  }
}

async function runSmokeTests() {
  console.log(`\n${colors.bold('6) Smoke tests')}`);
  return new Promise((resolve) => {
    const { spawn } = require('node:child_process');
    const proc = spawn('node', ['tests/smoke.test.js'], { stdio: 'inherit' });
    proc.on('exit', (code) => {
      if (code === 0) pass('All smoke tests passed');
      else fail(`Smoke tests exited with code ${code}`);
      resolve();
    });
  });
}

async function main() {
  console.log(colors.bold('\n🩺 N3mak Bot — verification report\n'));
  await checkNode();
  await checkEnv();
  await checkTelegram();
  await checkPostgres();
  await checkRedis();
  await runSmokeTests();

  console.log(`\n${colors.bold('Summary')}`);
  console.log(`  ${colors.green(`${results.passed} passed`)} | ${results.red(`${results.failed} failed`)} | ${colors.yellow(`${results.warnings} warnings`)}`);

  if (results.failed === 0) {
    console.log(`\n${colors.green(colors.bold('✅ Everything looks good. The bot is ready to run.'))}`);
    console.log(`\nStart the server with:\n  ${colors.cyan('npm start')}\n`);
  } else {
    console.log(`\n${colors.red(colors.bold('❌ Some checks failed. Fix the issues above before deploying.'))}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(colors.red('Fatal error:'), err);
  process.exit(1);
});
