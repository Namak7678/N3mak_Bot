const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, creditDeposit } = require('./db');

function fakeClient(insertRowCount) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('INSERT')) return { rowCount: insertRowCount };
      if (sql.startsWith('UPDATE')) return { rowCount: 1 };
      return { rowCount: 0 };
    },
    release() { calls.push('RELEASE'); },
  };
}

test('new deposit returns applied=true and credits net of fee', async () => {
  const client = fakeClient(1);
  pool.connect = async () => client;
  const result = await creditDeposit(123, 25, 'stars:charge-new');
  assert.deepEqual(result, { fee: 0.5, credited: 24.5, applied: true });
  assert.equal(client.calls.some(call => String(call).startsWith('UPDATE')), true);
});

test('duplicate deposit returns applied=false and does not update the balance', async () => {
  const client = fakeClient(0);
  pool.connect = async () => client;
  const result = await creditDeposit(123, 25, 'stars:charge-existing');
  assert.deepEqual(result, { fee: 0.5, credited: 24.5, applied: false });
  assert.equal(client.calls.some(call => String(call).startsWith('UPDATE')), false);
});
