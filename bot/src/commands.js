const { upsertUser } = require('./db');
const { formatMarketSnapshot } = require('./markets');
const { isConfigured, createDepositSession, DEPOSIT_AMOUNTS_USD } = require('./payments');

const MARKETS = ['🇺🇸 US', '🇪🇺 Europe', '🇦🇪 GCC', '🇬🇧 UK', '🇷🇺 Russia', '🌍 Africa'];

function registerCommands(bot) {
  bot.start(async (ctx) => {
    const payload = ctx.startPayload; // referral code if any
    try {
      await upsertUser(ctx.from, payload ? Number(payload) : null);
    } catch (err) {
      console.error('[db] upsertUser failed (non-fatal):', err.message);
    }
    await ctx.reply(
      `👋 Welcome to N3mak, ${ctx.from.first_name || ''}!\n\n` +
      `🌍💰 Your Smart Global Investment Platform.\n` +
      `Invest across US, Europe, GCC, UK, Russia & Africa — fully online.\n\n` +
      `Use /help to see all commands.`
    );
  });

  bot.help((ctx) =>
    ctx.reply(
      `📋 Available commands:\n\n` +
      `/invest - Explore investment opportunities\n` +
      `/portfolio - View your current portfolio\n` +
      `/deposit - Add funds in your preferred currency\n` +
      `/withdraw - Withdraw your profits or balance\n` +
      `/markets - Browse available global markets\n` +
      `/support - Contact our support team\n` +
      `/referral - Share your invite link & earn rewards\n` +
      `/language - Change bot language`
    )
  );

  bot.command('invest', async (ctx) => {
    try {
      const snapshot = await formatMarketSnapshot();
      await ctx.reply(`💼 Opening investment window across global markets.\n\n${snapshot}\n\nUse /deposit to fund your wallet and get started.`);
    } catch {
      await ctx.reply('💼 Investment opportunities are being prepared for your account. Try /deposit to fund your wallet.');
    }
  });

  bot.command('portfolio', (ctx) =>
    ctx.reply('📊 You have no active investments yet. Use /invest to get started.')
  );

  bot.command('deposit', async (ctx) => {
    if (!isConfigured()) {
      await ctx.reply('💳 Payment system is not activated yet by the N3mak team. Coming online soon.');
      return;
    }
    await ctx.reply(
      '💳 Choose a deposit amount (USD):',
      {
        reply_markup: {
          inline_keyboard: [DEPOSIT_AMOUNTS_USD.map((a) => ({ text: `$${a}`, callback_data: `deposit:${a}` }))],
        },
      }
    );
  });

  bot.action(/^deposit:(\d+)$/, async (ctx) => {
    const amount = Number(ctx.match[1]);
    try {
      const url = await createDepositSession(amount, ctx.from.id);
      await ctx.answerCbQuery();
      await ctx.reply(`✅ Tap below to complete your $${amount} deposit securely via Stripe:\n${url}`);
    } catch (err) {
      console.error('[payments] session creation failed:', err.message);
      await ctx.answerCbQuery('Failed to start payment', { show_alert: true });
    }
  });

  bot.command('withdraw', (ctx) =>
    ctx.reply('🏦 Withdrawal requests will appear here once your account has a balance.')
  );

  bot.command('markets', async (ctx) => {
    try {
      const snapshot = await formatMarketSnapshot();
      await ctx.reply(`🌍 Available global markets:\n${MARKETS.join('\n')}\n\n${snapshot}`);
    } catch (err) {
      console.error('[markets] rate fetch failed:', err.message);
      await ctx.reply(`🌍 Available global markets:\n${MARKETS.join('\n')}`);
    }
  });

  bot.command('support', (ctx) =>
    ctx.reply('🛟 Need help? Our support team will be with you shortly. Please describe your issue.')
  );

  bot.command('referral', async (ctx) => {
    const botInfo = await ctx.telegram.getMe();
    const link = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
    await ctx.reply(`🎁 Share your referral link and earn rewards:\n${link}`);
  });

  bot.command('language', (ctx) =>
    ctx.reply('🌐 Language selection is coming soon. Currently supported: English, العربية, Русский.')
  );
}

module.exports = { registerCommands };
