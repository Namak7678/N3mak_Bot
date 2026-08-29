const { upsertUser, getBalance, creditReferralBonus, getPlatformRevenue } = require('./db');
const { formatMarketSnapshot } = require('./markets');
const { isConfigured, createDepositSession, DEPOSIT_AMOUNTS_USD } = require('./payments');

const MARKETS = ['🇺🇸 US', '🇪🇺 Europe', '🇦🇪 GCC', '🇬🇧 UK', '🇷🇺 Russia', '🌍 Africa'];

function registerCommands(bot) {
  bot.start(async (ctx) => {
    const payload = ctx.startPayload; // referral code if any
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
        await ctx.telegram.sendMessage(referredBy, `🎉 Someone joined using your referral link! $1 bonus credited to your wallet.`).catch(() => {});
      } catch (err) {
        console.error('[referral] bonus credit failed (non-fatal):', err.message);
      }
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

  bot.command('portfolio', async (ctx) => {
    try {
      const balance = await getBalance(ctx.from.id);
      if (balance > 0) {
        await ctx.reply(`📊 Wallet balance: $${balance.toFixed(2)}\n\nNo active market positions yet — allocations are coming soon.`);
      } else {
        await ctx.reply('📊 Wallet balance: $0.00\n\nUse /deposit to fund your wallet and get started.');
      }
    } catch (err) {
      console.error('[portfolio] failed:', err.message);
      await ctx.reply('📊 Unable to load your balance right now, try again shortly.');
    }
  });

  bot.command('deposit', async (ctx) => {
    if (!isConfigured()) {
      await ctx.reply('💳 Payment system is not activated yet by the N3mak team. Coming online soon.');
      return;
    }
    await ctx.reply(
      '💳 Choose a deposit amount (USD). A 2% platform fee applies; the rest is credited to your wallet instantly:',
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
    await ctx.reply(`🎁 Invite friends and earn $1 per signup, credited straight to your wallet:\n${link}`);
  });

  bot.command('language', (ctx) =>
    ctx.reply('🌐 Language selection is coming soon. Currently supported: English, العربية, Русский.')
  );

  bot.command('chatid', (ctx) => {
    console.log(`[chatid] ${ctx.chat.type} -> ${ctx.chat.id} (${ctx.chat.title || ctx.chat.username || ''})`);
    ctx.reply(`Chat ID: ${ctx.chat.id}`);
  });

  bot.on('channel_post', (ctx) => {
    if (ctx.channelPost.text === '/chatid') {
      const chat = ctx.channelPost.chat;
      console.log(`[chatid] channel -> ${chat.id} (${chat.title || chat.username || ''})`);
      ctx.telegram.sendMessage(chat.id, `Chat ID: ${chat.id}`).catch(() => {});
    }
  });

  // Owner-only: real platform revenue (2% fee), not the total held in
  // user wallets — that money belongs to users, not to N3mak.
  bot.command('revenue', async (ctx) => {
    const ownerId = process.env.OWNER_TELEGRAM_ID;
    if (!ownerId || String(ctx.from.id) !== String(ownerId)) {
      return; // silently ignore for everyone else
    }
    try {
      const { total_fees, total_deposited, deposit_count } = await getPlatformRevenue();
      await ctx.reply(
        `📈 N3mak platform revenue\n\n` +
        `Real earned fees (2%): $${Number(total_fees).toFixed(2)}\n` +
        `Total deposited by users: $${Number(total_deposited).toFixed(2)}\n` +
        `Number of deposits: ${deposit_count}\n\n` +
        `⚠️ Only the fee is N3mak's — the rest is user wallet balance, not profit.`
      );
    } catch (err) {
      console.error('[revenue] failed:', err.message);
      await ctx.reply('Could not load revenue right now.');
    }
  });
}

module.exports = { registerCommands };
