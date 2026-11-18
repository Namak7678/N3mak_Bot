const DEFAULT_PLANS = Object.freeze({
  pioneer: process.env.WHOP_PIONEER_PLAN_ID || 'plan_n2uiwphhI5YG7',
  starter: process.env.WHOP_PLAN_ID || 'plan_IkWmnOwW1ShYY',
  pro: process.env.WHOP_PRO_PLAN_ID || 'plan_SrqGnbkktuOUc',
});

function positivePrice(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildCheckoutUrl(envName, planId) {
  const fallback = `https://whop.com/checkout/${encodeURIComponent(planId)}`;
  const configured = String(process.env[envName] || '').trim();
  if (!configured) return fallback;
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' || !/(^|\\.)whop\\.com$/i.test(url.hostname)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

const URLS = Object.freeze({
  pioneer: buildCheckoutUrl('WHOP_PIONEER_CHECKOUT_URL', DEFAULT_PLANS.pioneer),
  starter: buildCheckoutUrl('WHOP_CHECKOUT_URL', DEFAULT_PLANS.starter),
  pro: buildCheckoutUrl('WHOP_PRO_CHECKOUT_URL', DEFAULT_PLANS.pro),
});

const PRICES = Object.freeze({
  pioneer: positivePrice(process.env.WHOP_PIONEER_PRICE_USD, 3),
  starter: positivePrice(process.env.WHOP_STARTER_PRICE_USD || process.env.WHOP_PRICE_USD, 9),
  pro: positivePrice(process.env.WHOP_PRO_PRICE_USD, 49),
});

function isConfigured() {
  return process.env.WHOP_ENABLED !== 'false' && Boolean(URLS.pioneer && URLS.starter && URLS.pro);
}

function pioneerPriceUsd() { return PRICES.pioneer; }
function starterPriceUsd() { return PRICES.starter; }
function priceUsd() { return PRICES.starter; }
function proPriceUsd() { return PRICES.pro; }
function pioneerCheckoutUrl() { return URLS.pioneer; }
function starterCheckoutUrl() { return URLS.starter; }
function checkoutUrl() { return URLS.starter; }
function proCheckoutUrl() { return URLS.pro; }
function productName() { return process.env.WHOP_PRODUCT_NAME || 'N3mak AI Gateway'; }

module.exports = {
  isConfigured,
  pioneerPriceUsd,
  starterPriceUsd,
  priceUsd,
  proPriceUsd,
  pioneerCheckoutUrl,
  starterCheckoutUrl,
  checkoutUrl,
  proCheckoutUrl,
  productName,
};
