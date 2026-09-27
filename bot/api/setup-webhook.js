// One-time (idempotent, safe to re-run) endpoint to point Telegram's
// webhook at this deployment. Gated by SETUP_SECRET so a random visitor
// can't repoint your bot's webhook elsewhere.
const { bot } = require('../src/bot-instance');

module.exports = async (req, res) => {
  const secret = process.env.SETUP_SECRET;
  if (secret && req.query.secret !== secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const base = process.env.PUBLIC_URL || `https://${req.headers.host}`;
  try {
    await bot.telegram.setWebhook(`${base}/api/telegram`);
    const info = await bot.telegram.getWebhookInfo();
    res.status(200).json({ ok: true, webhook: info });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
