const test = require('node:test');
const assert = require('node:assert/strict');
const { acknowledgeWebhook } = require('./webhook-response');

function fakeResponse() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('webhook is acknowledged only after processing succeeds', async () => {
  const response = fakeResponse();
  let processed = false;
  await acknowledgeWebhook(response, async () => {
    processed = true;
  });
  assert.equal(processed, true);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { received: true });
});

test('processing errors return 500 for provider retries', async () => {
  const response = fakeResponse();
  const errors = [];
  await acknowledgeWebhook(
    response,
    async () => { throw new Error('database unavailable'); },
    error => errors.push(error.message),
  );
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { received: false });
  assert.deepEqual(errors, ['database unavailable']);
});
