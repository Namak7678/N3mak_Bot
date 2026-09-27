// Vercel Cron target — see vercel.json. Hobby plan only allows a cron to
// fire once per day, so this replaces the twice-daily Railway schedule
// with a single daily post (documented limitation, see N3MAK_VERCEL.md).
const { bot } = require('../src/bot-instance');
const { postOnce } = require('../src/scheduler');

module.exports = async (req, res) => {
  // Vercel Cron requests carry this header; reject anything else so the
  // endpoint can't be used by a random visitor to spam the channel.
  if (process.env.VERCEL && req.headers['x-vercel-cron'] !== '1') {
    res.status(401).end();
    return;
  }
  try {
    const result = await postOnce(bot);
    res.status(200).json(result);
  } catch (err) {
    console.error('[cron-promo] failed:', err.message);
    res.status(500).json({ posted: false, error: err.message });
  }
};
