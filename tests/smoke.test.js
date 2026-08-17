/**
 * Smoke tests for N3mak bot server
 * - Validates JS syntax & module structure (no network calls)
 * - Verifies exports
 * - Verifies command registrations
 * - Confirms environment variable contract
 *
 * Run: npm test
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function run() {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${t.name}`);
      console.log(`      ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed (${tests.length} total)`);
  process.exit(failed > 0 ? 1 : 0);
}

// ─── 1. Project structure ────────────────────────────────────────────────
test('package.json exists and is valid', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.name, 'n3mak-bot');
  assert.equal(pkg.main, 'src/index.js');
  assert.equal(pkg.type, 'commonjs');
  assert.ok(pkg.dependencies.telegraf);
  assert.ok(pkg.dependencies.express);
  assert.ok(pkg.dependencies.pg);
  assert.ok(pkg.dependencies.ioredis);
  assert.ok(pkg.dependencies.dotenv);
  assert.ok(pkg.scripts.start);
});

test('.env.example declares all required vars', () => {
  const env = fs.readFileSync('.env.example', 'utf8');
  for (const key of ['TELEGRAM_BOT_TOKEN', 'DATABASE_URL', 'REDIS_URL', 'PORT', 'PUBLIC_URL', 'NODE_ENV']) {
    assert.ok(env.includes(`${key}=`), `Missing ${key} in .env.example`);
  }
});

test('src/ directory has the 4 expected modules', () => {
  const expected = ['index.js', 'commands.js', 'db.js', 'redis.js'];
  for (const file of expected) {
    assert.ok(fs.existsSync(path.join('src', file)), `Missing src/${file}`);
  }
});

// ─── 2. Module exports (loadable) ────────────────────────────────────────
test('src/redis.js exports redis client and checkRateLimit', () => {
  // Override env to avoid real connection
  process.env.REDIS_URL = 'redis://localhost:6379';
  const mod = require('../src/redis');
  assert.equal(typeof mod.checkRateLimit, 'function');
  assert.ok(mod.redis);
});

test('src/db.js exports pool, initDb, upsertUser', () => {
  const mod = require('../src/db');
  assert.ok(mod.pool);
  assert.equal(typeof mod.initDb, 'function');
  assert.equal(typeof mod.upsertUser, 'function');
});

test('src/commands.js exports registerCommands function', () => {
  const mod = require('../src/commands');
  assert.equal(typeof mod.registerCommands, 'function');
});

// ─── 3. Commands registration contract ──────────────────────────────────
test('registerCommands wires all 10 expected commands', () => {
  const { registerCommands } = require('../src/commands');
  const registered = new Set();
  const fakeBot = {
    start: (h) => registered.add('start'),
    help: (h) => registered.add('help'),
    command: (name) => {
      // Telegraf supports both string and regex. Accept both.
      if (typeof name === 'string') registered.add(name);
      return () => {};
    },
  };
  registerCommands(fakeBot);
  for (const cmd of ['start', 'help', 'invest', 'portfolio', 'deposit', 'withdraw', 'markets', 'support', 'referral', 'language']) {
    assert.ok(registered.has(cmd), `Missing command: /${cmd}`);
  }
});

// ─── 4. /start welcome message includes required copy ───────────────────
test('/start welcome message includes key marketing phrases', () => {
  // Force-load a fresh copy (other tests may have cached a partial fakeBot)
  delete require.cache[require.resolve('../src/commands')];
  const { registerCommands } = require('../src/commands');
  let capturedHandler;
  const fakeBot = {
    start: (h) => { capturedHandler = h; },
    help: () => {},
    command: () => () => {},
  };
  registerCommands(fakeBot);
  assert.ok(capturedHandler, 'No handler captured for /start');

  // Mock Telegraf context
  const replies = [];
  const ctx = {
    from: { id: 12345, first_name: 'Tester', username: 'tester' },
    startPayload: null,
    reply: async (text) => { replies.push(text); },
  };

  // We can't await here without async, so call and check synchronously
  // upsertUser will fail (no DB) but that's fine for the text check
  return capturedHandler(ctx).catch(() => {}).then(() => {
    assert.equal(replies.length, 1, 'Expected exactly one reply');
    const msg = replies[0];
    assert.ok(msg.includes('N3mak'), 'Welcome message must mention N3mak');
    assert.ok(msg.includes('Global Investment'), 'Welcome message must mention Global Investment');
    assert.ok(msg.includes('/help'), 'Welcome message must point to /help');
  });
});

// ─── 5. /help lists all commands ────────────────────────────────────────
test('/help response includes all 10 commands', () => {
  const { registerCommands } = require('../src/commands');
  let helpHandler;
  const fakeBot = {
    start: () => {},
    help: (h) => { helpHandler = h; },
    command: () => () => {},
  };
  registerCommands(fakeBot);
  assert.ok(helpHandler);

  const replies = [];
  const ctx = { reply: async (t) => { replies.push(t); } };
  return helpHandler(ctx).then(() => {
    const msg = replies[0];
    for (const cmd of ['/invest', '/portfolio', '/deposit', '/withdraw', '/markets', '/support', '/referral', '/language']) {
      assert.ok(msg.includes(cmd), `Help message missing ${cmd}`);
    }
  });
});

// ─── 6. /markets mentions all 6 regions ────────────────────────────────
test('/markets lists all 6 global markets', () => {
  delete require.cache[require.resolve('../src/commands')];
  const { registerCommands } = require('../src/commands');
  let marketsHandler;
  const fakeBot = {
    start: () => {},
    help: () => {},
    command: (name, h) => {
      if (name === 'markets') marketsHandler = h;
      return () => {};
    },
  };
  registerCommands(fakeBot);
  assert.ok(marketsHandler, 'No handler captured for /markets');

  const replies = [];
  const ctx = { reply: async (t) => { replies.push(t); } };
  return marketsHandler(ctx).then(() => {
    const msg = replies[0];
    for (const market of ['US', 'Europe', 'GCC', 'UK', 'Russia', 'Africa']) {
      assert.ok(msg.includes(market), `Markets list missing ${market}`);
    }
  });
});

// ─── 7. src/index.js structural integrity ──────────────────────────────
test('src/index.js boots Express and sets up health endpoint', () => {
  const code = fs.readFileSync('src/index.js', 'utf8');
  assert.ok(code.includes("require('express')"), 'index.js must import express');
  assert.ok(code.includes("require('dotenv')"), 'index.js must import dotenv');
  assert.ok(code.includes("require('./db')"), 'index.js must import db');
  assert.ok(code.includes("require('./redis')"), 'index.js must import redis');
  assert.ok(code.includes("require('./commands')"), 'index.js must import commands');
  assert.ok(code.includes("new Telegraf"), 'index.js must instantiate Telegraf');
  assert.ok(code.includes("'/api/health'"), 'index.js must mount /api/health');
  assert.ok(code.includes("process.env.PUBLIC_URL"), 'index.js must check PUBLIC_URL for webhook mode');
  assert.ok(code.includes("bot.telegram.setWebhook"), 'index.js must call setWebhook when in webhook mode');
});

// ─── 8. Webhook / polling decision logic ────────────────────────────────
test('index.js contains fallback to polling when PUBLIC_URL is missing', () => {
  const code = fs.readFileSync('src/index.js', 'utf8');
  assert.ok(code.includes('bot.launch'), 'index.js must call bot.launch() as polling fallback');
});

// ─── 9. README mentions all 3 languages and BotFather description ──────
test('README.md is trilingual (AR/EN/RU) and includes BotFather description', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.ok(readme.includes('العربية'), 'README must include Arabic section');
  assert.ok(readme.includes('English'), 'README must include English section');
  assert.ok(readme.includes('Русский'), 'README must include Russian section');
  assert.ok(readme.includes('BotFather'), 'README must include BotFather description block');
  assert.ok(readme.includes('Smart Global Investment Platform'), 'README must contain the official tagline');
});

console.log('\n🧪 N3mak bot server — smoke tests\n');
run();
