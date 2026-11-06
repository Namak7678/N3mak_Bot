const cron = require('node-cron');
const { formatMarketSnapshot } = require('./markets');

const PIONEER = process.env.WHOP_PIONEER_CHECKOUT_URL || 'https://whop.com/checkout/plan_n2uiwphhI5YG7';
const STARTER = process.env.WHOP_STARTER_CHECKOUT_URL || 'https://whop.com/checkout/plan_IkWmnOwW1ShYY';
const BOT = 'https://t.me/N3mak_bot';
const STORE = process.env.PUBLIC_SHARE_URL || 'https://n3mak-buy.vercel.app/';

const PROMO_MESSAGES = [
  () => `🔥 عرض اليوم — N3mak AI Gateway\n\nPioneer بـ $3 فقط (مقاعد محدودة)\n${PIONEER}\n\nأو Starter $9 بكود first9 = $6\n${STARTER}\n\nالبوت: ${BOT} → /buy\nالمتجر: ${STORE}`,
  () => `🧠 بوابة نماذج AI (OmniRoute) + تسليم مفتاح فوري على تيليجرام بعد الدفع.\n\nابدأ بـ $3:\n${PIONEER}\n\nجرّب البوت: ${BOT}`,
  () => `Built an AI gateway with instant Telegram key delivery.\nPioneer today: $3 → ${PIONEER}\nBot: ${BOT}`,
  async () => {
    try {
      const snapshot = await formatMarketSnapshot();
      return `💱 لمحة سريعة:\n${snapshot}\n\nومع ذلك المنتج الأساسي اليوم: N3mak AI Gateway\nPioneer $3 → ${PIONEER}`;
    } catch {
      return `🚀 N3mak AI — مفتاح فوري بعد الدفع.\n${PIONEER}`;
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

  // 09:00, 15:00, 21:00 Asia/Riyadh ≈ 06:00, 12:00, 18:00 UTC
  cron.schedule('0 6,12,18 * * *', async () => {
    try {
      const gen = PROMO_MESSAGES[cursor % PROMO_MESSAGES.length];
      cursor += 1;
      const text = await gen();
      await bot.telegram.sendMessage(channelId, text, { disable_web_page_preview: false });
      console.log('[scheduler] posted to channel');
    } catch (err) {
      console.error('[scheduler] post failed:', err.message);
    }
  });

  console.log(`[scheduler] auto-posting enabled for channel ${channelId} (06/12/18 UTC)`);
}

module.exports = { startScheduledPosts };
