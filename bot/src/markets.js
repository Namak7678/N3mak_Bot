// Live currency exchange rates — no API key needed (open.er-api.com is free/public).
let cache = { data: null, ts: 0 };
const TTL_MS = 5 * 60 * 1000; // 5 min cache to avoid hammering the free API

async function getRates() {
  if (cache.data && Date.now() - cache.ts < TTL_MS) return cache.data;
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  const json = await res.json();
  if (json.result !== 'success') throw new Error('rates provider error');
  cache = { data: json.rates, ts: Date.now() };
  return json.rates;
}

async function formatMarketSnapshot() {
  const rates = await getRates();
  const pick = (c) => rates[c] ? rates[c].toFixed(4) : 'n/a';
  return (
    `💱 Live rates (base: 1 USD)\n\n` +
    `🇦🇪 AED: ${pick('AED')}\n` +
    `🇪🇺 EUR: ${pick('EUR')}\n` +
    `🇬🇧 GBP: ${pick('GBP')}\n` +
    `🇷🇺 RUB: ${pick('RUB')}\n` +
    `🇸🇦 SAR: ${pick('SAR')}\n` +
    `🇳🇬 NGN: ${pick('NGN')}\n\n` +
    `Updated just now.`
  );
}

module.exports = { getRates, formatMarketSnapshot };
