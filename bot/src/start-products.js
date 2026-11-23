// وحدة منتجات نعمك في شاشة الترحيب — أمر Issa «استحداث خدمات تساعد في البيع» (جلسة 2026-11-23)
// تعرض المنتجات/الخدمات القابلة للشراء فوراً عند /start:
// 1) وكيل العقارات /realtor (المنتج الرئيسي $2,500-4,000 + $600-1,200/شهر)
// 2) مخططات الأتمتة /pack (450⭐)
// 3) التجربة المجانية /trial (قمع الدخول)
// الأزرار كلها callback_data لأوامر موجودة أصلاً — صفر منطق جديد في هذه الوحدة.

function productsRow() {
  return [
    { text: '🏠 عقارات /realtor', callback_data: 'menu:realtor_hint' },
    { text: '📘 مخططات /pack', callback_data: 'menu:pack_hint' },
  ];
}

function registerStartProducts(bot) {
  // تلميح أوامر المنتجات عند الضغط — يشرح ثم يوجه للأمر نفسه
  bot.action('menu:realtor_hint', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      '🏠 <b>N3mak RealtorVoice — AI Property Agent</b>\n' +
        '━━━━━━━━━━━━━━━━\n' +
        'نقبل كل مكالمة ورسالة لمكتبك العقاري 24/7 — تأهيل فوري وحجز معاينات.\n\n' +
        '<b>التسعير:</b> $2,500–4,000 تركيب + $600–1,200/شهر\n\n' +
        'هل أنت مشترٍ/بائع تبحث عن عقار في أمريكا/كندا؟\n' +
        'اكتب <code>/realtor</code> الآن وسيؤهلك الوكيل خلال دقيقة.\n\n' +
        '<i>EN:</i> Our AI answers every call 24/7. Buyers/sellers: type /realtor now.',
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
    );
  });

  bot.action('menu:pack_hint', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      '📘 <b>10 مخططات أتمتة AI جاهزة للتنفيذ</b>\n' +
        '━━━━━━━━━━━━━━━━\n' +
        'كل مخطط: البرومبت + الحزمة التقنية + وقت النشر + التسعير الموصى به.\n\n' +
        'اطلب الآن بـ <code>/pack</code> — الدفع بنجوم تيليجرام (450⭐).\n\n' +
        '<i>EN:</i> 10 ready-to-deploy AI automation blueprints — /pack (450 Stars).'
    , { parse_mode: 'HTML' });
  });
}

module.exports = { registerStartProducts, productsRow };
