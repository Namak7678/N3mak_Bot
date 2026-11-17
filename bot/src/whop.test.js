const test = require('node:test');
const assert = require('node:assert/strict');
const whop = require('./whop');

test('Whop defaults match the existing fulfillment plan IDs and prices', () => {
  assert.equal(whop.isConfigured(), true);
  assert.equal(whop.pioneerPriceUsd(), 3);
  assert.equal(whop.starterPriceUsd(), 9);
  assert.equal(whop.priceUsd(), 9);
  assert.equal(whop.proPriceUsd(), 49);
  assert.equal(whop.pioneerCheckoutUrl(), 'https://whop.com/checkout/plan_n2uiwphhI5YG7');
  assert.equal(whop.checkoutUrl(), 'https://whop.com/checkout/plan_IkWmnOwW1ShYY');
  assert.equal(whop.proCheckoutUrl(), 'https://whop.com/checkout/plan_SrqGnbkktuOUc');
});
