const { upsertUser, getBalance, creditReferralBonus, getPlatformRevenue } = require('./db');
const { formatMarketSnapshot } = require('./markets');
const { isConfigured: stripeConfigured, createDepositSession, DEPOSIT_AMOUNTS_USD } = require('./payments');
const starsPayments = require('./starsPayments');
const blueprints = require('./blueprints');
const whop = require('./whop');
const { chat: llmChat, isEnabled: llmEnabled } = require('./llm');
const trialGw = require('./trial/gateway');

const MARKETS = ['🇺🇸 US', '🇪🇺 Europe', '🇦🇪 GCC', '🇬🇧 UK', '🇷🇺 Russia', '🌍 Africa'];

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function safeBalance(telegramId) {
  try {
    return await getBalance(telegramId);
  } catch {
    return null;
  }
}

function formatBalanceAr(balance) {
  if (balance === null || balance === undefined) return '— (جارٍ التحميل)';
  return `$${Number(balance).toFixed(2)}`;
}

function paymentMenuKeyboard() {
  const rows = [];
  if (whop.isConfigured()) {
    rows.push([{ text: `⚡ Starter $${whop.starterPriceUsd()}`, url: whop.starterCheckoutUrl() }]);
    rows.push([{ text: `⚡ Whop $${whop.priceUsd()} Starter`, url: whop.checkoutUrl() }]);
    rows.push([{ text: `💎 Whop $${whop.proPriceUsd()} Pro`, url: whop.proCheckoutUrl() }]);
  }
  if (starsPayments.isConfigured()) {
    rows.push(
      starsPayments.DEPOSIT_AMOUNTS_STARS.map((t) => ({
        text: `⭐ ${t.label}`,
        callback_data: `deposit_stars:${t.stars}`,
      }))
    );
  }
  if (stripeConfigured()) {
    rows.push(
      DEPOSIT_AMOUNTS_USD.map((a) => ({
        text: `💵 Stripe $${a}`,
        callback_data: `deposit:${a}`,
      }))
    );
  }
  rows.push([
    { text: '📊 رصيدي /portfolio', callback_data: 'menu:portfolio' },
    { text: '🛟 دعم /support', callback_data: 'menu:support' },
  ]);
  return { inline_keyboard: rows };
}

function startKeyboard() {
  const rows = [];
  rows.push([{ text: '🎁 جرّب مجاناً / Free trial', callback_data: 'menu:trial' }]);
  if (whop.isConfigured()) {
    rows.push([{ text: `🔥 Pioneer $${whop.pioneerPriceUsd()} — اليوم فقط`, url: whop.pioneerCheckoutUrl() }]);
    rows.push([{ text: `⚡ Starter $${whop.starterPriceUsd()} — اشترِ الآن`, url: whop.starterCheckoutUrl() }]);
    rows.push([{ text: `💎 Pro $${whop.proPriceUsd()}`, url: whop.proCheckoutUrl() }]);
  }
  rows.push(productsRow());
  rows.push([
    { text: '💰 إيداع', callback_data: 'menu:deposit' },
    { text: '📊 المحفظة', callback_data: 'menu:portfolio' },
  ]);
  rows.push([
    { text: '🤖 اسأل /ask', callback_data: 'menu:ask_hint' },
    { text: '📋 الأوامر', callback_data: 'menu:help' },
  ]);
  rows.push([{ text: '🛟 الدعم', callback_data: 'menu:support' }]);
  return { inline_keyboard: rows };
}

function welcomeText(firstName, balance) {
  const name = firstName || 'عزيزي';
  const bal = formatBalanceAr(balance);
  const starter = whop.isConfigured()
    ? `\n⚡ <b>Starter $${whop.starterPriceUsd()}</b> — <a href="${whop.starterCheckoutUrl()}">ادفع الآن</a>\n` +
      `💎 <b>Pro $${whop.proPriceUsd()}</b> — <a href="${whop.proCheckoutUrl()}">ترقية</a>\n` +
      `🏷 كود خصم: <code>first9</code> (−$3 على Starter)\n`
    : '';
  return (
    `✨ <b>أهلاً ${escapeHtml(name)}</b>\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🚀 <b>N3mak AI</b> — بوابة OmniRoute متعددة النماذج\n` +
    `مفتاح API فوري بعد الدفع · مناسب للبوتات والتطبيقات.\n\n` +
    `💼 رصيد المحفظة: <b>${bal}</b>\n` +
    starter +
    `\n📌 <b>ابدأ خلال دقيقة</b>\n` +
    `0️⃣ /trial — جرّب مجاناً 24 ساعة (20 طلب/يوم)\n` +
    `📘 /pack — حزمة المخططات 450⭐\n` +
    `🏠 /realtor — وكيل العقارات AI (شراء/بيع/إيجار US/CA)\n` +
    `1️⃣ /buy — اشترِ البوابة عبر Whop\n` +
    `2️⃣ /deposit_stars — إيداع بنجوم تيليجرام\n` +
    `3️⃣ /ask — جرّب الذكاء مباشرة\n\n` +
    `<i>EN:</i> Multi-model AI gateway via OmniRoute. From $${whop.starterPriceUsd()} on Whop · Stars deposits supported.`
  );
}

function depositMenuText() {
  const parts = [
    `💰 <b>شحن المحفظة / Deposit</b>`,
    `━━━━━━━━━━━━━━━━`,
    `اختر طريقة الدفع المناسبة:`,
    ``,
  ];
  if (whop.isConfigured()) {
    parts.push(
      `💳 <b>Whop — $${whop.priceUsd()} (موصى به اليوم)</b>`,
      escapeHtml(whop.productName()),
      `<a href="${whop.checkoutUrl()}">${whop.checkoutUrl()}</a>`,
      ``
    );
  }
  if (starsPayments.isConfigured()) {
    parts.push(
      `⭐ <b>نجوم تيليجرام (Telegram Stars)</b>`,
      `100⭐ → $25 · 250⭐ → $50 · 500⭐ → $100`,
      `رسوم المنصة 2% · اضغط الزر بالأسفل`,
      ``
    );
  }
  if (stripeConfigured()) {
    parts.push(`💵 <b>Stripe</b> — بطاقة مباشرة ($25 / $50 / $100) · رسوم 2%`, ``);
  } else {
    parts.push(`💵 Stripe — غير مفعّل حالياً (بانتظار المفاتيح)`, ``);
  }
  parts.push(`<i>EN:</i> Prefer Whop $${whop.priceUsd()} link or /deposit_stars for Stars invoices.`);
  return parts.join('\n');
}

function helpText() {
  return (
    `📋 <b>أوامر N3mak</b>\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `/start — القائمة الرئيسية\n` +
    `/trial — تجربة مجانية 24 ساعة (gpt-oss-20b، 20 طلب/يوم)\n` +
    `/pack — حزمة 10 مخططات أتمتة (450⭐)\n` +
    `/realtor — وكيل العقارات AI (شراء/بيع/إيجار US/CA)\n` +
    `/buy أو /pricing — شراء بوابة AI عبر Whop $${whop.priceUsd()}\n` +
    `/deposit — شحن المحفظة (Whop + Stars${stripeConfigured() ? ' + Stripe' : ''})\n` +
    `/deposit_stars — دفع بنجوم تيليجرام فقط\n` +
    `/portfolio — رصيد المحفظة\n` +
    `/invest — فرص الاستثمار\n` +
    `/markets — الأسواق العالمية\n` +
    `/ask — اسأل ذكاء N3mak (OmniRoute)\n` +
    `/referral — رابط الدعوة (+$1)\n` +
    `/support — الدعم\n` +
    `/help — هذه القائمة\n\n` +
    `<i>EN:</i> /trial · /pack · /realtor · /buy · /deposit · /deposit_stars · /portfolio · /ask · /support`
  );
}

function registerCommands(bot) {
  bot.start(async (ctx) => {
    const payload = String(ctx.startPayload || '').trim();
    const isRadarEntry = ['radar', 'radar_page'].includes(payload.toLowerCase());
    const parsedReferral = /^\d+$/.test(payload) ? Number(payload) : null;
    const referredBy = Number.isSafeInteger(parsedReferral) && parsedReferral > 0
      ? parsedReferral
      : null;
    let isNewUser = false;
    try {
      isNewUser = await upsertUser(ctx.from, referredBy);
    } catch (err) {
      console.error('[db] upsertUser failed (non-fatal):', err.message);
    }

    if (isNewUser && referredBy && referredBy !== ctx.from.id) {
      try {
        await creditReferralBonus(referredBy, ctx.from.id);
        await ctx.telegram
          .sendMessage(
            referredBy,
            `🎉 انضم شخص عبر رابطك! تم إضافة مكافأة $1 إلى محفظتك.\nSomeone joined via your referral — $1 credited.`
          )
          .catch(() => {});
      } catch (err) {
        console.error('[referral] bonus credit failed (non-fatal):', err.message);
      }
    }

    if (isRadarEntry) {
      await ctx.reply(
        '🌍 <b>N3mak Radar24</b>\n' +
        'Global Cyber Threat Intelligence — متابعة مشهد التهديدات السيبرانية حول العالم.\n\n' +
        '📡 انضم إلى القناة لمشاهدة التنبيهات والتحديثات: <a href="https://t.me/n3makradar24">N3mak Radar24</a>\n' +
        'English: Follow the channel for global cyber threat updates and exposure intelligence.',
        {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: {
            inline_keyboard: [
              [{ text: '📡 Join N3mak Radar24', url: 'https://t.me/n3makradar24' }],
              [{ text: '🌐 Open Radar Website', url: 'https://namak7678.github.io/n3mak-radar/' }],
              [{ text: '📤 Share the Channel', url: 'https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fn3makradar24&text=Follow%20N3mak%20Radar24%20for%20global%20cyber%20threat%20intelligence' }]
            ]
          }
        }
      );
      return;
    }

    const balance = await safeBalance(ctx.from.id);
    await ctx.reply(welcomeText(ctx.from.first_name, balance), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: startKeyboard(),
    });
  });

  bot.help((ctx) =>
    ctx.reply(helpText(), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
  );

  async function sendBuy(ctx) {
    if (!whop.isConfigured()) {
      await ctx.reply(
        '💳 رابط Whop غير مضبوط بعد. استخدم /deposit_stars للدفع بنجوم تيليجرام.\nWhop link missing — use /deposit_stars.'
      );
      return;
    }
    const text =
      `⚡ <b>${escapeHtml(whop.productName())}</b>\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `سعر اليوم: <b>$${whop.priceUsd()}</b> (دفعة واحدة)\n` +
      `يشمل: وصول بوابة N3mak AI / OmniRoute\n\n` +
      `🔗 <a href="${whop.checkoutUrl()}">ادفع الآن بأمان عبر Whop</a>\n` +
      `${whop.checkoutUrl()}\n\n` +
      `أو اشحن المحفظة بنجوم تيليجرام: /deposit_stars\n\n` +
      `<i>EN:</i> One-time $${whop.priceUsd()} via Whop checkout. Stars: /deposit_stars`;
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: `🔥 Pioneer $${whop.pioneerPriceUsd()} اليوم`, url: whop.pioneerCheckoutUrl() }],
          [{ text: `⚡ Starter $${whop.priceUsd()}`, url: whop.checkoutUrl() }],
          [{ text: `💎 Pro $${whop.proPriceUsd()}`, url: whop.proCheckoutUrl() }],
          [
            { text: '⭐ نجوم تيليجرام', callback_data: 'menu:deposit_stars' },
            { text: '💰 قائمة الإيداع', callback_data: 'menu:deposit' },
          ],
        ],
      },
    });
  }
