const ACTIVATION_EVENTS = new Set([
  'membership.activated',
  'membership.went_valid',
  'membership_activated',
  'payment.succeeded',
]);

function isWhopActivationEvent(eventType) {
  return ACTIVATION_EVENTS.has(String(eventType || '').trim().toLowerCase());
}

module.exports = { isWhopActivationEvent, ACTIVATION_EVENTS };
