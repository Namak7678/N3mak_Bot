const { upsertUser, getBalance, creditReferralBonus, getPlatformRevenue } = require('./db');
const { formatMarketSnapshot } = require('./markets');
const { isConfigured: stripeConfigured, createDepositSession, DEPOSIT_AMOUNTS_USD } = require('./payments');
const starsPayments = require('./starsPayments');
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
    `<i>EN:</i> /trial · /buy · /deposit · /deposit_stars · /portfolio · /ask · /support`
  );
}

function registerCommands(bot) {
  bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    const referredBy = payload ? Number(payload) : null;
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


  async function sendTrial(ctx) {
    const telegramId = ctx.from && ctx.from.id;
    if (!telegramId) {
      await ctx.reply('تعذّر قراءة معرّف تيليجرام.');
      return;
    }
    try {
      await ctx.sendChatAction('typing').catch(() => {});
      const { status, data } = await trialGw.mintTrial({ telegramId, test: false });
      if (status === 409 || (data && data.error === 'trial_already_used')) {
        const url = (data && data.upgrade_url) || trialGw.pioneerCheckoutUrl();
        await ctx.reply(
          '🙂 جرّبت التجربة المجانية من قبل.\n' +
            'كمّل بباقة Pioneer بـ $3 فقط:\n' +
            url +
            '\n\n<i>EN:</i> Free trial already used — Pioneer $3 keeps the same gateway.',
          {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            reply_markup: {
              inline_keyboard: [[{ text: '🔥 Pioneer $3', url }]],
            },
          }
        );
        return;
      }
      if (!data || !data.ok || !data.key) {
        console.error('[trial] mint failed', status, data);
        await ctx.reply('تعذّر إنشاء التجربة الآن. حاول بعد دقيقة أو /support.');
        return;
      }
      const base = trialGw.publicBaseUrl(data);
      const key = data.key;
      const expires = data.expires_at || '24h';
      const curl = [
        'curl ' + base + '/chat/completions \\',
        '  -H "Authorization: Bearer ' + key + '" \\',
        '  -H "Content-Type: application/json" \\',
        '  -d \'{"model":"gpt-oss-20b","messages":[{"role":"user","content":"Hello"}]}\'',
      ].join('\n');
      const already = data.already ? '\n(مفتاح تجربتك الحالي / existing active trial key)\n' : '';
      const body =
        '🎁 <b>تجربتك المجانية جاهزة</b>' +
        already +
        '\n━━━━━━━━━━━━━━━━\n' +
        'BASE_URL: <code>' +
        base +
        '</code>\n' +
        'API_KEY: <code>' +
        key +
        '</code>\n' +
        'MODEL: <code>gpt-oss-20b</code>\n' +
        'الحدود: 20 طلب/يوم · 5/دقيقة · تنتهي خلال 24 ساعة\n' +
        'Expires: <code>' +
        expires +
        '</code>\n\n' +
        'مثال / Example:\n<pre>' +
        curl.replace(/</g, '&lt;') +
        '</pre>\n\n' +
        'بعد التجربة: Pioneer $3 → /buy\n' +
        '<i>EN:</i> Free trial — gpt-oss-20b · 20 req/day · 24h.';
      await ctx.reply(body, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [[{ text: '🔥 Pioneer $3 بعد التجربة', url: trialGw.pioneerCheckoutUrl() }]],
        },
      });
    } catch (err) {
      console.error('[trial] error', err.message);
      await ctx.reply('تعذّر إنشاء التجربة. /support');
    }
  }

  bot.command('trial', sendTrial);
  bot.action('menu:trial', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await sendTrial(ctx);
  });

  bot.command('buy', sendBuy);
  bot.command('pricing', sendBuy);
  bot.command('whop', sendBuy);

  bot.command('invest', async (ctx) => {
    try {
      const snapshot = await formatMarketSnapshot();
      await ctx.reply(
        `💼 <b>نافذة الاستثمار</b>\n\n${escapeHtml(snapshot)}\n\nشحن المحفظة: /deposit · شراء البوابة: /buy`,
        { parse_mode: 'HTML' }
      );
    } catch {
      await ctx.reply('💼 فرص الاستثمار تُجهَّز لحسابك. ابدأ بـ /deposit أو /buy.');
    }
  });



  bot.command('share', async (ctx) => {
    const pioneer = whop.pioneerCheckoutUrl();
    const shareTg = `https://t.me/share/url?url=${encodeURIComponent(pioneer)}&text=${encodeURIComponent('🔥 N3mak AI Gateway — Pioneer $3 اليوم + مفتاح فوري على تيليجرام')}`;
    const shareX = `https://twitter.com/intent/tweet?text=${encodeURIComponent('N3mak AI Gateway — OmniRoute + instant Telegram key. Pioneer $3: '+pioneer)}`;
    const pack = (process.env.PUBLIC_SHARE_URL || 'https://n3mak-buy.vercel.app/share.html').trim();
    await ctx.reply(
      `📣 <b>انشر العرض — زوّد المشاهدات والعملاء</b>\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `1) حوّل للمجموعات\n` +
      `2) أو اضغط أزرار المشاركة\n` +
      `3) حزمة كاملة: <a href="${pack}">${pack}</a>\n\n` +
      `🎯 الهدف: أول دفعة اليوم`,
      {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔥 ادفع Pioneer $3', url: pioneer }],
            [{ text: '📤 مشاركة تيليجرام', url: shareTg }],
            [{ text: '𝕏 نشر على X', url: shareX }],
            [{ text: '📦 حزمة المنشورات', url: pack }],
          ],
        },
      }
    );
  });

  bot.command('apps', async (ctx) => {
    const appsUrl = (process.env.PUBLIC_APPS_URL || '').trim() || 'https://n3mak-buy.vercel.app/apps.html';
    const text =
      `📦 <b>مشاريع N3mak للبيع</b>\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `1) <b>AI Gateway</b> — OmniRoute · من $9\n` +
      `2) <b>AI Chat</b> — شات ويب مربوط Whop (قيد النشر)\n` +
      `3) <b>Frontend SaaS / v2</b> — من أرشيف GitHub → نفس القمع\n\n` +
      `🔗 <a href="${appsUrl}">كتالوج التطبيقات</a>\n` +
      `💳 /buy · 🤖 @N3mak_bot\n\n` +
      `<i>EN:</i> Product catalog — Gateway live, Chat PR merged path, legacy zips funnel here.`;
    await ctx.reply(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [{ text: `🔥 Pioneer $${whop.pioneerPriceUsd()} اليوم`, url: whop.pioneerCheckoutUrl() }],
          [{ text: `⚡ Starter $${whop.priceUsd()}`, url: whop.checkoutUrl() }],
          [{ text: `💎 Pro $${whop.proPriceUsd()}`, url: whop.proCheckoutUrl() }],
          [{ text: '📦 كتالوج Apps', url: appsUrl }],
        ],
      },
    });
  });

  bot.command('portfolio', async (ctx) => {
    try {
      const balance = await getBalance(ctx.from.id);
      if (Number(balance) > 0) {
        await ctx.reply(
          `📊 <b>محفظتك</b>\nالرصيد: <b>$${Number(balance).toFixed(2)}</b>\n\nلا مراكز سوق نشطة بعد — قريباً.\n<i>EN:</i> Wallet $${Number(balance).toFixed(2)} — no open positions yet.`,
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.reply(
          `📊 الرصيد: <b>$0.00</b>\n\nاشحن عبر /deposit أو اشترِ البوابة /buy\n<i>EN:</i> Empty wallet — use /deposit or /buy.`,
          { parse_mode: 'HTML', reply_markup: paymentMenuKeyboard() }
        );
      }
    } catch (err) {
      console.error('[portfolio] failed:', err.message);
      await ctx.reply('📊 تعذّر تحميل الرصيد حالياً، حاول بعد لحظات.');
    }
  });

  bot.command('deposit', async (ctx) => {
    await ctx.reply(depositMenuText(), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: paymentMenuKeyboard(),
    });
  });

  bot.command('deposit_stars', async (ctx) => {
    if (!starsPayments.isConfigured()) {
      await ctx.reply('⭐ مدفوعات النجوم تحتاج TELEGRAM_BOT_TOKEN (البوت يعمل عادةً).');
      return;
    }
    await ctx.reply(
      '⭐ <b>إيداع بنجوم تيليجرام</b>\nاختر الفئة (مكافئ دولار للمحفظة). رسوم المنصة 2%:\n' +
        '<i>EN:</i> Pick a Stars tier — same USD credit as card deposits.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            starsPayments.DEPOSIT_AMOUNTS_STARS.map((t) => ({
              text: t.label,
              callback_data: `deposit_stars:${t.stars}`,
            })),
            [{ text: `💳 أو Whop $${whop.priceUsd()}`, url: whop.checkoutUrl() }],
          ],
        },
      }
    );
  });

  bot.action('menu:deposit', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(depositMenuText(), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: paymentMenuKeyboard(),
    });
  });

  bot.action('menu:deposit_stars', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!starsPayments.isConfigured()) {
      await ctx.reply('⭐ Stars offline.');
      return;
    }
    await ctx.reply('⭐ اختر فئة النجوم:', {
      reply_markup: {
        inline_keyboard: [
          starsPayments.DEPOSIT_AMOUNTS_STARS.map((t) => ({
            text: t.label,
            callback_data: `deposit_stars:${t.stars}`,
          })),
        ],
      },
    });
  });

  bot.action('menu:portfolio', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    try {
      const balance = await getBalance(ctx.from.id);
      await ctx.reply(`📊 الرصيد: $${Number(balance).toFixed(2)}`);
    } catch {
      await ctx.reply('📊 تعذّر تحميل الرصيد.');
    }
  });

  bot.action('menu:support', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      '🛟 <b>الدعم</b>\nصف مشكلتك هنا وسنتابع.\nللشراء السريع: /buy\n<i>EN:</i> Describe your issue — or /buy for checkout.',
      { parse_mode: 'HTML' }
    );
  });

  bot.action('menu:help', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(helpText(), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  bot.action('menu:ask_hint', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(
      '🤖 اكتب:\n<code>/ask ما أفضل سوق اليوم؟</code>\n\n<i>EN:</i> /ask your question',
      { parse_mode: 'HTML' }
    );
  });

  bot.action(/^deposit:(\d+)$/, async (ctx) => {
    const amount = Number(ctx.match[1]);
    if (!DEPOSIT_AMOUNTS_USD.includes(amount)) {
      await ctx.answerCbQuery('مبلغ غير صالح', { show_alert: true });
      return;
    }
    if (!stripeConfigured()) {
      await ctx.answerCbQuery('Stripe غير مفعّل — استخدم Whop أو النجوم', { show_alert: true });
      return;
    }
    try {
      const url = await createDepositSession(amount, ctx.from.id);
      await ctx.answerCbQuery();
      const fee = Math.round(amount * 0.02 * 100) / 100;
      const credited = Math.round((amount - fee) * 100) / 100;
      await ctx.reply(
        `✅ أكمل إيداع $${amount} عبر Stripe:\n${url}\n\nبعد الدفع: $${credited} للمحفظة (رسوم 2% = $${fee}).`
      );
    } catch (err) {
      console.error('[payments] session creation failed:', err.message);
      await ctx.answerCbQuery('فشل بدء الدفع', { show_alert: true });
    }
  });

  bot.action(/^deposit_stars:(\d+)$/, async (ctx) => {
    const amountStars = Number(ctx.match[1]);
    const tier = starsPayments.findTierByStars(amountStars);
    if (!tier) {
      await ctx.answerCbQuery('فئة نجوم غير صالحة', { show_alert: true });
      return;
    }
    if (!starsPayments.isConfigured()) {
      await ctx.answerCbQuery('نجوم غير متاحة', { show_alert: true });
      return;
    }
    try {
      const url = await starsPayments.createStarsInvoiceLink(
        ctx.telegram,
        ctx.chat.id,
        amountStars,
        ctx.from.id
      );
      await ctx.answerCbQuery();
      const fee = Math.round(tier.usd * 0.02 * 100) / 100;
      const credited = Math.round((tier.usd - fee) * 100) / 100;
      await ctx.reply(
        `⭐ ادفع <b>${tier.stars}⭐</b> لإيداع <b>$${tier.usd}</b>:\n${url}\n\n` +
          `بعد الدفع: $${credited} للمحفظة (2% = $${fee}).\n` +
          `<i>EN:</i> Pay ${tier.stars} Stars → $${credited} credited.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[stars] invoice link failed:', err.message);
      await ctx.answerCbQuery('فشل إنشاء فاتورة النجوم', { show_alert: true });
    }
  });

  bot.command('withdraw', (ctx) =>
    ctx.reply(
      '🏦 طلبات السحب تظهر هنا عند وجود رصيد.\n<i>EN:</i> Withdrawals appear once you have a balance.',
      { parse_mode: 'HTML' }
    )
  );

  bot.command('markets', async (ctx) => {
    try {
      const snapshot = await formatMarketSnapshot();
      await ctx.reply(`🌍 <b>الأسواق المتاحة</b>\n${MARKETS.join('\n')}\n\n${escapeHtml(snapshot)}`, {
        parse_mode: 'HTML',
      });
    } catch (err) {
      console.error('[markets] rate fetch failed:', err.message);
      await ctx.reply(`🌍 الأسواق:\n${MARKETS.join('\n')}`);
    }
  });

  bot.command('ask', async (ctx) => {
    const question = (ctx.message?.text || '').replace(/^\/ask(@\w+)?\s*/i, '').trim();
    if (!question) {
      await ctx.reply('الاستخدام: /ask سؤالك\nUsage: /ask &lt;question&gt;', { parse_mode: 'HTML' });
      return;
    }
    if (!llmEnabled()) {
      await ctx.reply('الذكاء غير مفعّل بعد (OPENAI_BASE_URL).');
      return;
    }
    try {
      await ctx.sendChatAction('typing').catch(() => {});
      const answer = await llmChat(
        [
          {
            role: 'system',
            content:
              'You are N3mak assistant for a global investment Telegram bot (Arabic-first). Be concise, helpful, and honest. Prefer Arabic when the user writes Arabic. Do not invent balances, deposits, or market guarantees. Mention /buy for Whop $49 gateway and /deposit_stars for Stars when relevant.',
          },
          { role: 'user', content: question },
        ],
        { max_tokens: 256 }
      );
      await ctx.reply(answer || 'لا رد من الذكاء الاصطناعي.');
    } catch (err) {
      console.error('[llm] ask failed (soft):', err.message);
      await ctx.reply('الذكاء غير متاح مؤقتاً. جرّب لاحقاً أو /support.');
    }
  });

  bot.command('support', (ctx) =>
    ctx.reply(
      '🛟 <b>فريق الدعم</b>\nصف مشكلتك هنا.\nشراء سريع: /buy · إيداع: /deposit\n<i>EN:</i> Describe your issue. Quick buy: /buy',
      { parse_mode: 'HTML' }
    )
  );

  bot.command('referral', async (ctx) => {
    const botInfo = await ctx.telegram.getMe();
    const link = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
    await ctx.reply(
      `🎁 ادعُ أصدقاءك واحصل على <b>$1</b> لكل تسجيل:\n${link}\n\n<i>EN:</i> Earn $1 per signup via your link.`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('language', (ctx) =>
    ctx.reply('🌐 العربية هي الافتراضية الآن. English secondary. Русский قريباً.')
  );

  bot.command('chatid', (ctx) => {
    console.log(`[chatid] ${ctx.chat.type} -> ${ctx.chat.id} (${ctx.chat.title || ctx.chat.username || ''})`);
    ctx.reply(`Chat ID: ${ctx.chat.id}`);
  });

  bot.on('channel_post', (ctx) => {
    if (ctx.channelPost?.text === '/chatid') {
      const chat = ctx.channelPost.chat;
      console.log(`[chatid] channel -> ${chat.id} (${chat.title || chat.username || ''})`);
      ctx.telegram.sendMessage(chat.id, `Chat ID: ${chat.id}`).catch(() => {});
    }
  });

  bot.command('revenue', async (ctx) => {
    const ownerId = process.env.OWNER_TELEGRAM_ID;
    if (!ownerId || String(ctx.from.id) !== String(ownerId)) {
      return;
    }
    try {
      const row = await getPlatformRevenue();
      const totalFees = row.total_fees ?? row.total_fees ?? 0;
      const totalDeposited = row.total_deposited ?? row.total_deposited ?? 0;
      const depositCount = row.deposit_count ?? row.deposit_count ?? 0;
      await ctx.reply(
        `📈 إيرادات منصة N3mak\n\n` +
          `رسوم مكتسبة (2%): $${Number(totalFees).toFixed(2)}\n` +
          `إجمالي إيداعات المستخدمين: $${Number(totalDeposited).toFixed(2)}\n` +
          `عدد الإيداعات: ${depositCount}\n\n` +
          `⚠️ الرسوم فقط ملك N3mak — الباقي أرصدة مستخدمين.`
      );
    } catch (err) {
      console.error('[revenue] failed:', err.message);
      await ctx.reply('تعذّر تحميل الإيرادات الآن.');
    }
  });
}

module.exports = { registerCommands };
