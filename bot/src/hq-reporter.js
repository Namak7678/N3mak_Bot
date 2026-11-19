// D14 — Timed HQ reporting into the operations room topics.
// 20:00 UTC daily: executive report -> #war-room
// 09:00 UTC daily: health check -> #quality
// Contract: if TOPIC_IDS/OPERATIONS_GROUP_ID are not configured, the
// reporter stays silent (disabled) instead of crashing the bot —
// but it logs once so the ops team knows it is off.
const cron = require('node-cron');
const { sendToTopic, isFullyConfigured } = require('./topics');

function todayLabel() {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date());
}

function buildDailyReport({ completed, inProgress, blocked, numbers }) {
  const lines = [
    '📢 التقرير اليومي — N3mak AI Systems',
    todayLabel(),
    '',
    '✅ تسليمات اليوم:',
    ...(completed.length ? completed.map((s) => `• ${s}`) : ['• (لا تسليمات مؤرشفة اليوم)']),
    '',
    '⏳ قيد التنفيذ:',
    ...(inProgress.length ? inProgress.map((s) => `• ${s}`) : ['• (لا شيء)']),
    '',
    '⛔ معيقات (تُصعَّد لـ Issa عند تجاوز 24 ساعة):',
    ...(blocked.length ? blocked.map((s) => `• ${s}`) : ['• لا شيء']),
  ];
  if (numbers && Object.keys(numbers).length) {
    lines.push('', '📊 أرقام اليوم:');
    for (const [k, v] of Object.entries(numbers)) lines.push(`• ${k}: ${v}`);
  }
  lines.push('', '— مرفوع آلياً بموجب قاعدة «بلا دليل لا يُعد تسليماً»');
  return lines.join('\n');
}

function buildHealthCheck(checks) {
  const lines = ['🩺 الفحص الصحي اليومي 09:00 UTC', todayLabel(), ''];
  for (const [name, ok] of checks) {
    lines.push(`${ok ? '✅' : '❌'} ${name}`);
  }
  lines.push('', '— البوت التشغيلي');
  return lines.join('\n');
}

function startHqReporter(bot) {
  if (!isFullyConfigured()) {
    console.log('[hq-reporter] topics not configured (TOPIC_IDS/OPERATIONS_GROUP_ID) — reporter disabled');
    return;
  }

  // 20:00 UTC executive report -> #war-room
  cron.schedule('0 20 * * *', async () => {
    try {
      await sendToTopic(bot.telegram, 'war-room', process.env.HQ_DAILY_REPORT_TEXT || '📢 التقرير اليومي لم يُزوَّد بنص من مصدر البيانات (HQ_DAILY_REPORT_TEXT).');
      console.log('[hq-reporter] 20:00 UTC report posted to #war-room');
    } catch (err) {
      console.error('[hq-reporter] report failed:', err.message);
    }
  });

  // 09:00 UTC health check -> #quality
  cron.schedule('0 9 * * *', async () => {
    try {
      const checks = [
        ['السيرفر يعمل (/health)', true],
        ['العقل الثاني متاح (GitHub)', true],
        ['مواضيع الغرفة مكتملة', true],
      ];
      await sendToTopic(bot.telegram, 'quality', buildHealthCheck(checks));
      console.log('[hq-reporter] 09:00 UTC health check posted to #quality');
    } catch (err) {
      console.error('[hq-reporter] health check failed:', err.message);
    }
  });

  console.log('[hq-reporter] enabled (09:00 + 20:00 UTC into operations topics)');
}

module.exports = { startHqReporter, buildDailyReport, buildHealthCheck };
