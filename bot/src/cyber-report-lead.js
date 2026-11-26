// Defensive cyber-risk report intake for N3mak Radar.
// Collects company-level public identifiers only; never request passwords or breach data.
const sessions = new Map();
const FIELDS = [
  { key: 'company', label: 'Company name', question: '🏢 اكتب اسم الشركة / Company name:' },
  { key: 'domain', label: 'Public website/domain', question: '🌐 اكتب الموقع العام للشركة (إن وجد) / Public domain:' },
  { key: 'country', label: 'Country', question: '🌍 الدولة / Country:' },
  { key: 'report', label: 'Report type', question: '📄 نوع الطلب: تقرير أولي مجاني (FREE) أو تقرير تفصيلي (DETAILED) أو مراقبة شهرية (MONITOR):' },
  { key: 'contact', label: 'Business contact', question: '✉️ بريد عمل أو وسيلة تواصل (اختياري، اكتب SKIP للتخطي):' },
];

function safe(value) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, 250);
}
function cancel(text) {
  const t = String(text || '').trim().toLowerCase();
  return t.startsWith('/') || ['cancel', 'stop', 'إلغاء'].includes(t);
}
function registerCyberReportFlow(bot) {
  bot.command('cyberreport', async (ctx) => {
    const id = ctx.from?.id;
    if (!id) return;
    sessions.set(id, { telegramId: id, username: ctx.from.username || '', firstName: ctx.from.first_name || '', fields: {}, step: 0, createdAt: new Date().toISOString() });
    await ctx.reply('🛡 <b>N3mak Cyber Risk Intelligence</b>\nنموذج طلب تقرير عن إشارات التعرض المنشورة علناً. لا ترسل كلمات مرور أو ملفات أو بيانات مسروقة.\n\n' + FIELDS[0].question + '\nاكتب /cancel للإلغاء.', { parse_mode: 'HTML' });
  });
  bot.on('text', async (ctx, next) => {
    const s = sessions.get(ctx.from?.id);
    if (!s || cancel(ctx.message?.text)) {
      if (s && cancel(ctx.message?.text) && !String(ctx.message.text).startsWith('/')) {
        sessions.delete(ctx.from.id);
        await ctx.reply('تم إلغاء الطلب. /cyberreport لبدء طلب جديد.');
        return;
      }
      return next();
    }
    const field = FIELDS[s.step];
    if (!field) { sessions.delete(ctx.from.id); return next(); }
    const value = safe(ctx.message.text);
    s.fields[field.key] = field.key === 'contact' && value.toUpperCase() === 'SKIP' ? 'Not provided' : value;
    s.step++;
    if (s.step < FIELDS.length) {
      await ctx.reply(FIELDS[s.step].question);
      return;
    }
    sessions.delete(ctx.from.id);
    const f = s.fields;
    const message = [
      '🛡 N3mak Cyber Report lead',
      'Company: ' + f.company,
      'Public domain: ' + (f.domain || 'Not provided'),
      'Country: ' + f.country,
      'Requested: ' + f.report,
      'Contact: ' + (f.contact || 'Not provided'),
      'Telegram: @' + (s.username || 'not set') + ' | ID ' + s.telegramId,
      'Received: ' + s.createdAt,
      'Source: N3mak Radar services page',
      'Note: intake only; claim must be independently validated.',
    ].join('\n');
    let delivered = false;
    try {
      const group = process.env.OPERATIONS_GROUP_ID;
      const rawTopics = process.env.TOPIC_IDS || '';
      const pairs = Object.fromEntries(rawTopics.split(',').map(x => x.split('=')).filter(x => x.length === 2));
      if (group) {
        const opts = pairs['cyber-leads'] && Number(pairs['cyber-leads']) > 0 ? { message_thread_id: Number(pairs['cyber-leads']) } : {};
        await ctx.telegram.sendMessage(group, message, opts);
        delivered = true;
      }
    } catch (e) { console.error('[cyberreport] lead notification failed:', e.message); }
    await ctx.reply(delivered
      ? '✅ تم استلام طلبك وإرساله لفريق N3mak للمراجعة. هذا ليس تأكيداً بوجود اختراق أو عرضاً مدفوعاً ملزماً.\nReference: N3-CY-' + String(s.telegramId).slice(-5)
      : '✅ تم استلام بيانات الطلب داخل جلسة البوت. لم يتم إرسالها إلى فريق العمليات لأن قناة التسليم غير مهيأة حالياً. لا تعتبر الطلب تأكيداً بوجود اختراق أو حجزاً مدفوعاً.\nللتواصل لاحقاً: N3mak.team@proton.me');
  });
}
module.exports = { registerCyberReportFlow };
