const test = require('node:test');
const assert = require('node:assert/strict');

test('SARA uses the dedicated N3mak Free AI endpoint when explicitly enabled', async () => {
  const names = ['N3MAK_FREE_AI_ENABLED', 'N3MAK_FREE_AI_BASE_URL', 'N3MAK_FREE_AI_TOKEN', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.N3MAK_FREE_AI_ENABLED = 'true';
    process.env.N3MAK_FREE_AI_BASE_URL = 'https://n3mak-gateway.n3mak.workers.dev/v1/internal/free';
    process.env.N3MAK_FREE_AI_TOKEN = 'test-internal-token';
    process.env.OPENAI_BASE_URL = 'https://paid-or-legacy.example/v1';
    process.env.OPENAI_API_KEY = 'legacy-key';
    process.env.OPENAI_MODEL = 'legacy-model';

    delete require.cache[require.resolve('./llm')];
    const client = require('./llm');
    let request;
    global.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'N3mak Free AI connected.' } }] }) };
    };

    const answer = await client.chat([{ role: 'user', content: 'Connection proof' }]);
    assert.equal(answer, 'N3mak Free AI connected.');
    assert.equal(request.url, 'https://n3mak-gateway.n3mak.workers.dev/v1/internal/free/chat/completions');
    assert.equal(request.options.headers.Authorization, 'Bearer test-internal-token');
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.model, 'n3mak/free');
    assert.equal(payload.messages[0].content, 'Connection proof');
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    delete require.cache[require.resolve('./llm')];
  }
});

test('SARA does not fall back to the legacy provider when Free AI is unavailable', async () => {
  const names = ['N3MAK_FREE_AI_ENABLED', 'N3MAK_FREE_AI_BASE_URL', 'N3MAK_FREE_AI_TOKEN', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  try {
    process.env.N3MAK_FREE_AI_ENABLED = 'true';
    process.env.N3MAK_FREE_AI_BASE_URL = 'https://n3mak-gateway.n3mak.workers.dev/v1/internal/free';
    process.env.N3MAK_FREE_AI_TOKEN = 'test-internal-token';
    process.env.OPENAI_BASE_URL = 'https://legacy-provider.example/v1';
    process.env.OPENAI_API_KEY = 'legacy-key';
    delete require.cache[require.resolve('./llm')];
    const client = require('./llm');
    const requests = [];
    global.fetch = async (url) => {
      requests.push(url);
      return { ok: false, status: 503, json: async () => ({ error: { message: 'free_ai_unavailable' } }) };
    };
    await assert.rejects(() => client.chat([{ role: 'user', content: 'Test failure path' }]), /free_ai_unavailable/);
    assert.deepEqual(requests, ['https://n3mak-gateway.n3mak.workers.dev/v1/internal/free/chat/completions']);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    delete require.cache[require.resolve('./llm')];
  }
});

