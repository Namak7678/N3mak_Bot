const { upsertUser } = require('./db');

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

  bot.command('invest', (ctx) =>
    ctx.reply('💼 Investment opportunities are being prepared for your account. This section is coming online soon.')
  );

  bot.command('portfolio', (ctx) =>
    ctx.reply('📊 You have no active investments yet. Use /invest to get started.')
  );

  bot.command('deposit', (ctx) =>
    ctx.reply('💳 To deposit funds, choose your currency (USD / AED). Payment integration is being connected.')
  );

  bot.command('withdraw', (ctx) =>
    ctx.reply('🏦 Withdrawal requests will appear here once your account has a balance.')
  );

  bot.command('markets', (ctx) =>
    ctx.reply(`🌍 Available global markets:\n\n${MARKETS.join('\n')}`)
  );

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
