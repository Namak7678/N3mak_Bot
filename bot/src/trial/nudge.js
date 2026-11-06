/**
 * Periodic trial expiry / daily-limit nudges → Pioneer $3.
 * Runs every 15 minutes. Marks each trial nudged once.
 */
const { listNudgePending, markNudged, pioneerCheckoutUrl } = require('./gateway');

const INTERVAL_MS = 15 * 60 * 1000;

function nudgeText(reason) {
  const url = pioneerCheckoutUrl();
  const why =
    reason === 'daily_limit'
      ? 'خلصت طلبات التجربة اليومية / Your free trial daily limit is used up.'
      : 'انتهت تجربتك المجانية (24 ساعة) / Your 24h free trial has ended.';
  return (
    `⏰ ${why}\n\n` +
    `كمّل بباقة Pioneer بـ $3 فقط — نفس البوابة، 200 طلب/يوم:\n` +
    `${url}\n\n` +
    `Or type /buy in @N3mak_bot`
  );
}

function startTrialNudges(bot) {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const res = await listNudgePending();
      if (!res.ok || !res.data || !Array.isArray(res.data.trials)) {
        if (res.status !== 401) console.warn('[trial-nudge] pending failed', res.status, res.data && res.data.error);
        return;
      }
      for (const t of res.data.trials) {
        const chatId = t.telegram_id;
        if (!chatId) continue;
        try {
          await bot.telegram.sendMessage(chatId, nudgeText(t.reason), { disable_web_page_preview: true });
          await markNudged([t.key_id]);
          console.log('[trial-nudge] sent', t.key_id, chatId, t.reason);
        } catch (err) {
          // User may have never /start'ed — still mark to avoid hammering
          const desc = String(err && err.message || err);
          console.warn('[trial-nudge] DM failed', chatId, desc);
          if (/bot can't initiate|chat not found|blocked|Forbidden/i.test(desc)) {
            await markNudged([t.key_id]).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error('[trial-nudge] tick error', err.message);
    } finally {
      running = false;
    }
  }
  setTimeout(tick, 20_000);
  setInterval(tick, INTERVAL_MS);
  console.log('[trial-nudge] scheduled every 15m');
}

module.exports = { startTrialNudges, nudgeText };
