// وحدة منتجات نعمك — أمر Issa «استحداث خدمات تساعد في البيع» (جلسة 2026-11-23)
// تعمل مستقلة تماماً: أمر /products يعرض المنتجات الخمسة، وأزرار hint تُشرح كل منتج.
// لا تلمس أي ملف آخر — صفر تعديل على commands.js (ملف ضخم حساس في الإنتاج).

const PRODUCTS_TEXT =
  '🛍 <b>منتجات وخدمات N3mak</b>\n' +
  '━━━━━━━━━━━━━━━━\n' +
  '🏠 <b>وكيل العقارات AI</b> — يرد على كل مكالمة 24/7، يؤهّل، ويحجز معاينات\n' +
  '   التسعير: $2,500–4,000 تركيب + $600–1,200/شهر — <code>/realtor</code>\n\n' +
  '📘 <b>10 مخططات أتمتة AI</b> — جاهزة للتنفيذ بأسعار وأوقات نشر\n' +
  '   450⭐ — <code>/pack</code>\n\n' +
  '⚡ <b>بوابة AI متعددة النماذج</b> — مفتاح API فوري\n' +
  '   من $' + '3' + ' Pioneer — <code>/buy</code>\n\n' +
  '🎁 <b>تجربة مجانية 24 ساعة</b> — 20 طلب/يوم — <code>/trial</code>\n\n' +
  '🛟 خدمات أتمتة شهرية للشركات — <code>/support</code>\n\n' +
  '<i>EN:</i> AI property agent · Automation blueprints · AI gateway · Free trial — all inside this bot.';

function registerStartProducts(bot) {
  bot.command('products', async (ctx) => {
    await ctx.reply(PRODUCTS_TEXT, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🏠 /realtor', callback_data: 'menu:realtor_hint' },
            { text: '📘 /pack', callback_data: 'menu:pack_hint' },
          ],
          [
            { text: '🎁 تجربة مجانية', callback_data: 'menu:trial' },
            { text: '⚡ اشترِ الآن', callback_data: 'menu:buy_hint' },
          ],
        ],
      },
    });
  });

  bot.action('menu:realtor_hint', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      '🏠 <b>N3mak RealtorVoice — AI Property Agent</b>\n' +
        '━━━━━━━━━━━━━━━━\n' +
        'وكيل AI يقبل كل مكالمة ورسالة لمكتبك العقاري 24/7 — تأهيل فوري وحجز معاينات في تقويم وكلائك.\n\n' +
        '<b>التسعير:</b> $2,500–4,000 تركيب + $600–1,200/شهر\n' +
        '<b>للأفراد:</b> مشترٍ/بائع في أمريكا/كندا؟ اكتب <code>/realtor</code> — تأهيل خلال دقيقة.\n\n' +
        '<i>EN:</i> Our AI answers every call 24/7, qualifies, and books showings. Offices: reply here for a live demo.',
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
        '<i>EN:</i> 10 ready-to-deploy AI automation blueprints — /pack (450 Telegram Stars).',
      { parse_mode: 'HTML' }
    );
  });

  bot.action('menu:buy_hint', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      '⚡ للشراء الفوري: اكتب <code>/buy</code> (Whop) أو <code>/deposit_stars</code> (نجوم تيليجرام).\n' +
        '<i>EN:</i> Type /buy (Whop) or /deposit_stars (Telegram Stars).',
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { registerStartProducts };
