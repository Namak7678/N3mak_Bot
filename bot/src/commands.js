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
    `/buy أو /pricing — شراء بوابة AI عبر Whop $${whop.priceUsd()}\n` +
    `/deposit — شحن المحفظة (Whop + Stars${stripeConfigured() ? ' + Stripe' : ''})\n` +
    `/deposit_stars — دفع بنجوم تيليجرام فقط\n` +
    `/portfolio — رصيد المحفظة\n` +
    `/invest — فرص الاستثمار\n` +
    `/markets — الأسواق العالمية\n` +
    `/ask — اسأل ذكاء N3mak (OmniRoute)\n` +
    `/referral — رابط الدعوة (+$1)\n` +
    `/cyberreport — طلب تقرير مخاطر سيبرانية دفاعي من N3mak Radar\n` +
    `/support — الدعم\n` +
    `/help — هذه القائمة\n\n` +
    `<i>EN:</i> /trial · /pack · /buy · /deposit · /deposit_stars · /portfolio · /ask · /support`
  );
}

function registerCommands(bot) {
  bot.start(async (ctx) => {
    const payload = String(ctx.startPayload || '').trim();
    const isRadarEntry = ['radar', 'radar_page'].includes(payload.toLowerCase());
    const isCyberReportEntry = ['cyber_report', 'cyberreport'].includes(payload.toLowerCase());
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

    if (isCyberReportEntry) {
      await ctx.reply(
        '🛡 <b>N3mak Cyber Risk Intelligence</b>\\n\\nاطلب تقريراً دفاعياً عن إشارات التعرض المنشورة علناً أو مراقبة دورية. لا نطلب كلمات مرور أو بيانات مسروقة.\\n\\nاستخدم /cyberreport لبدء الطلب.',
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '📝 Start report request', callback_data: 'cyberreport:start' }], [{ text: '🌐 Services & pricing', url: 'https://namak7678.github.io/n3mak-radar/services.html' }]] } }
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
        'curl ' + base + '/chat/completions \\\n',
        '  -H "Authorization: Bearer ' + key + '" \\\n',
        '  -H "Content-Type: application/json" \\\n',
        '  -d \'{"model":"gpt-oss-20b","messages":[{"role":"user","content":"Hello"}]}\'',
      ].join('');
      const already = data.already ? '\n(مفتاح تجربتك الحالي لا يزال صالحاً — هذا رابط الاستخدام)' : '';
      await ctx.reply(
        '🎁 <b>تجربة مجانية 24 ساعة</b>\n' +
          '━━━━━━━━━━━━━━━━\n' +
          'مفتاحك جاهز — 20 طلب/يوم:\n\n' +
          '<code>' + key + '</code>\n\n' +
          '<b>مثال استخدام:</b>\n' +
          '<code>' + curl + '</code>\n' +
          already +
          '\n<i>EN:</i> Trial key active for 24h (20 req/day). Use it with any OpenAI-compatible client.',
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
      );
    } catch (err) {
      console.error('[trial] failed:', err.message);
      await ctx.reply('تعذّر إنشاء التجربة الآن. حاول بعد دقيقة أو /support.');
    }
  }

  bot.command('buy', (ctx) => sendBuy(ctx));
  bot.command('pricing', (ctx) => sendBuy(ctx));
  bot.command('trial', (ctx) => sendTrial(ctx));
  bot.action('menu:buy_hint', (ctx) => sendBuy(ctx));
  bot.action('menu:trial', (ctx) => sendTrial(ctx));

  bot.command('pack', async (ctx) => {
    const inv = await blueprints.createInvoice(bot, ctx);
    if (inv && inv.ok) return;
    if (inv && inv.error) {
      await ctx.reply('📘 ' + inv.error);
      return;
    }
    await ctx.reply('تعذّر إنشاء فاتورة المخططات الآن. جرّب /pack بعد قليل أو /support.');
  });

  bot.action('menu:deposit_stars', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await ctx.reply(depositMenuText(), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: paymentMenuKeyboard(),
    });
  });

  bot.command('deposit', async (ctx) => {
    await ctx.reply(depositMenuText(), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: paymentMenuKeyboard(),
    });
  });

  bot.command('deposit_stars', async (ctx) => {
    const ok = await starsPayments.sendInvoice(bot, ctx);
    if (!ok) {
      await ctx.reply('تعذّر إنشاء فاتورة النجوم الآن — استخدم /deposit ثم أعد المحاولة.');
    }
  });

  bot.action(/^deposit:/, async (ctx) => {
    const amount = Number(String(ctx.callbackQuery?.data || '').split(':')[1]);
    if (!amount) {
      await ctx.answerCbQuery('مبلغ غير صالح').catch(() => {});
      return;
    }
    const session = await createDepositSession(amount, ctx.from.id);
    if (session && session.url) {
      await ctx.answerCbQuery().catch(() => {});
      await ctx.reply(`🔗 أكمل الدفع هنا: ${session.url}`, {
        link_preview_options: { is_disabled: true },
      });
    } else {
      await ctx.answerCbQuery('تعذّر إنشاء الجلسة — جرّب لاحقاً').catch(() => {});
    }
  });

  bot.action(/^deposit_stars:/, async (ctx) => {
    const stars = Number(String(ctx.callbackQuery?.data || '').split(':')[1]);
    if (!stars) {
      await ctx.answerCbQuery('مبلغ غير صالح').catch(() => {});
      return;
    }
    const ok = await starsPayments.sendInvoice(bot, ctx, stars);
    if (!ok) {
      await ctx.answerCbQuery('تعذّر إنشاء فاتورة النجوم').catch(() => {});
    }
  });

  bot.command('portfolio', async (ctx) => {
    const balance = await safeBalance(ctx.from.id);
    await ctx.reply(
      `📊 <b>محفظتك</b>\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `💼 الرصيد: <b>${formatBalanceAr(balance)}</b>\n\n` +
        `اشحن الرصيد: /deposit\n` +
        `<i>EN:</i> Use /deposit to top up.`,
      { parse_mode: 'HTML' }
    );
  });

  bot.action('menu:portfolio', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const balance = await safeBalance(ctx.from.id);
    await ctx.reply(
      `📊 <b>محفظتك</b>\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `💼 الرصيد: <b>${formatBalanceAr(balance)}</b>\n\n` +
        `اشحن الرصيد: /deposit`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('invest', async (ctx) => {
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
              'You are N3mak investment analyst for global markets (Arabic-first). Be concise, honest, and never guarantee returns. Mention /markets for snapshots and /support for custom research.',
          },
          { role: 'user', content: 'قدم فرص استثمارية مختصرة عبر الأسواق العالمية اليوم' },
        ],
        { max_tokens: 256, task: 'general' }
      );
      await ctx.reply(answer || 'لا رد من الذكاء الاصطناعي.');
    } catch (err) {
      console.error('[llm] invest failed (soft):', err.message);
      await ctx.reply('الذكاء غير متاح مؤقتاً. جرّب لاحقاً أو /markets.');
    }
  });

  bot.command('markets', async (ctx) => {
    const text = await formatMarketSnapshot();
    await ctx.reply(text || 'تعذّر جلب لقطة الأسواق الآن.', {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
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
        { max_tokens: 256, task: 'general' }
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
