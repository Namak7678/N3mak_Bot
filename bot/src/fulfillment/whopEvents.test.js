const test = require('node:test');
const assert = require('node:assert/strict');
const { isWhopActivationEvent } = require('./whopEvents');

test('accepts supported membership activation events', () => {
  assert.equal(isWhopActivationEvent('membership.activated'), true);
  assert.equal(isWhopActivationEvent('membership.went_valid'), true);
  assert.equal(isWhopActivationEvent('membership_activated'), true);
});

test('accepts payment success for membership-linked fulfillment', () => {
  assert.equal(isWhopActivationEvent('payment.succeeded'), true);
});

test('rejects cancellations, failures, refunds, and unknown events', () => {
  for (const event of ['membership.deactivated','membership.went_invalid','membership.updated','payment.failed','refund.created','dispute.created','','unknown.event']) {
    assert.equal(isWhopActivationEvent(event), false, event);
  }
});

test('normalizes event casing and whitespace', () => {
  assert.equal(isWhopActivationEvent(' Membership.Activated '), true);
});
