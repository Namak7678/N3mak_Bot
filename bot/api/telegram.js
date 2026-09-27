// Vercel serverless entry point for Telegram updates (webhook mode only —
// there is no persistent process here to run long-polling).
const { bot } = require('../src/bot-instance');
const { ensureDbReady } = require('./_init');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('N3mak bot webhook is running.');
    return;
  }
  try {
    await ensureDbReady();
    await bot.handleUpdate(req.body, res);
  } catch (err) {
    console.error('[telegram webhook] error:', err.message);
  } finally {
    if (!res.writableEnded) res.status(200).end();
  }
};
