// مسار عملاء العقارات داخل البوت التجاري — ربط الوكيل العقاري بالمنظومة (ADR-011)
// كل عميل يبدأ /realtor يمر بتأهيل نصي مطابق لحقول المواصفة:
// intent → budget → area → timeline → تسجيل محفوظ + عرض أسعار المنتج الرسمي
// بلا LLM ولا قاعدة بيانات إضافية — الحقول تُجمع بجلسة داخل الذاكرة ثم تسلّم للمالك.

const OFFER = {
  setup: '$2,500–4,000 (one-time)',
  monthly: '$600–1,200/month',
  contact: 'N3mak.team@proton.me',
};

// جلسات مؤقتة — البوت يعمل بسيرفر واحد، والذاكرة تُمسح عند إعادة التشغيل.
// لاحقاً تُنقل الجلسات إلى جدول leads في Postgres عند أول عميل حقيقي.
const sessions = new Map();

const FIELDS = [
  { key: 'intent', question: 'Are you looking to BUY, RENT, or SELL?', hint: 'buy / rent / sell' },
  { key: 'budget', question: 'What budget range are you working with?', hint: 'e.g. 500k–800k' },
  { key: 'area', question: 'Which area/city are you targeting?', hint: 'e.g. Miami Beach, FL' },
  { key: 'timeline', question: 'What is your timeline?', hint: 'ASAP / 1–3 months / 3–6 months / just researching' },
];

function isCommandText(text) {
  const t = (text || '').trim();
  return t.startsWith('/') || t === 'cancel' || t === 'إلغاء';
}

function summaryLine(s) {
  const f = s.fields;
  return (
    `🏢 New realtor lead — Telegram ID ${s.telegramId}\n` +
    `• Intent: ${f.intent || '—'}\n` +
    `• Budget: ${f.budget || '—'}\n` +
 `• Area: ${f.area || '—'}\n` +
 `• Timeline: ${f.timeline || '—'}\n` +
 `• Collected: ${new Date(s.startedAt).toISOString()}\n` +
 `• Source: @N3mak_bot /realtor flow`
  );
}

function registerRealtorFlow(bot) {
  bot.command('realtor', async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    sessions.set(telegramId, {
      telegramId,
      fields: {},
      step: 0,
      startedAt: Date.now(),
    });
    await ctx.reply(
      '🏠 <b>N3mak RealtorVoice — Property Agent</b>\n' +
        '━━━━━━━━━━━━━━━━\n' +
        'I help you buy, rent, or sell property in the US/Canada — 24/7.\n' +
        'Answer 4 quick questions to get matched with an agent.\n\n' +
        `1️⃣ ${FIELDS[0].question}\n` +
        `<i>Type "cancel" any time to stop.</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // استماع لكل الرسائل النصية داخل جلسة نشطة — أقل تعديل ممكن على البوت الحي
  bot.on('text', async (ctx, next) => {
    const s = sessions.get(ctx.from?.id);
    if (!s || isCommandText(ctx.message.text)) return next();

    const field = FIELDS[s.step];
    if (!field) return next();

    s.fields[field.key] = ctx.message.text.trim().slice(0, 200);
    s.step += 1;

    if (s.step < FIELDS.length) {
      const nextField = FIELDS[s.step];
      await ctx.reply(`${s.step + 1}️⃣ ${nextField.question}`);
      return;
    }

    // اكتمل جمع الحقول — تسليم للمالك عبر قناة/مجموعة العمليات إن كانت مضبوطة
    sessions.delete(ctx.from.id);
    try {
      if (
        process.env.OPERATIONS_GROUP_ID &&
        process.env.TOPIC_IDS &&
        process.env.TOPIC_IDS.includes('war-room=') &&
        !/war-room=0(,|$)/.test(process.env.TOPIC_IDS)
      ) {
        const topicIds = parseTopicIds(process.env.TOPIC_IDS);
        await ctx.telegram.sendMessage(
          process.env.OPERATIONS_GROUP_ID,
          summaryLine(s),
          { message_thread_id: topicIds['war-room'] }
        );
        console.log('[realtor] lead delivered to operations war-room topic');
      }
    } catch (err) {
      console.error('[realtor] failed to notify operations room:', err.message);
    }

    await ctx.reply(
      '✅ <b>Got it — you are in the system.</b>\n' +
        '━━━━━━━━━━━━━━━━\n' +
        'An agent will contact you shortly.\n' +
        `Office line: ${OFFER.contact}\n\n` +
        '<i>EN:</i> Your details were recorded. An agent will reach out soon.',
      { parse_mode: 'HTML' }
    );
  });
}

function parseTopicIds(raw) {
  const out = {};
  for (const pair of String(raw || '').split(',')) {
    const [name, id] = pair.split('=');
    if (name && id) out[name.trim()] = Number(id);
  }
  return out;
}

module.exports = { registerRealtorFlow, parseTopicIds };
