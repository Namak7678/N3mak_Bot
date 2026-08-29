const cron = require('node-cron');
const { formatMarketSnapshot } = require('./markets');

// Rotates through a small set of promo messages so the channel doesn't
// look like a repeating bot spam loop.
const PROMO_MESSAGES = [
  () => `🚀 N3mak — استثمر في أسواق عالمية وحوّل مواردك الخاملة لدخل، كله من هنا.\nابدأ: /start`,
  () => `🛍️ عندك مورد مش مستغل (وقت، معدة، مساحة)؟ خليه يشتغل لك. جرب سوق الموارد الذكي.\nابدأ: /start`,
  async () => {
    try {
      const snapshot = await formatMarketSnapshot();
      return `💱 تحديث أسعار العملات اليوم:\n\n${snapshot}\n\nاستثمر الآن: /invest`;
    } catch {
      return `💰 استثمر في أسواق عالمية (أمريكا، أوروبا، الخليج، بريطانيا، روسيا، أفريقيا) — من هاتفك.\n/invest`;
    }
  },
];

let cursor = 0;

function startScheduledPosts(bot) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    console.log('[scheduler] TELEGRAM_CHANNEL_ID not set — auto-posting disabled');
    return;
  }

  // Every day at 12:00 and 20:00 server time (UTC on Railway).
  cron.schedule('0 12,20 * * *', async () => {
    try {
      const gen = PROMO_MESSAGES[cursor % PROMO_MESSAGES.length];
      cursor += 1;
      const text = await gen();
      await bot.telegram.sendMessage(channelId, text);
      console.log('[scheduler] posted to channel');
    } catch (err) {
      console.error('[scheduler] post failed:', err.message);
    }
  });

  console.log(`[scheduler] auto-posting enabled for channel ${channelId} (12:00 & 20:00 UTC)`);
}

module.exports = { startScheduledPosts };
