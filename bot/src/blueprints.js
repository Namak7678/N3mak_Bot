/**
 * Digital blueprint pack sold for Telegram Stars (XTR).
 * Ported from Namak7678/n3mak-bot-live (450⭐ PDF pack + optional monthly plans).
 *
 * Payload format: plan_<key>  e.g. plan_pack
 * Currency: XTR, empty provider_token.
 */

const PRODUCT_FILE =
  process.env.BLUEPRINT_PDF_URL ||
  'https://base44.app/api/apps/6ab5921b9ca1863c59719606/files/mp/public/6ab5921b9ca1863c59719606/a414de526_AI-Automation-Blueprints.pdf';

const PLANS = {
  pack: {
    title: '10 AI Automation Blueprints (PDF)',
    desc: 'Ten ready-to-sell automations with prompts, stack, deploy time and price to charge. Instant delivery.',
    stars: 450,
    kind: 'file',
  },
  basic: {
    title: 'N3mak Basic — monthly',
    desc: 'Daily opportunities digest + automation alerts.',
    stars: 300,
    kind: 'sub',
  },
  pro: {
    title: 'N3mak Pro — monthly',
    desc: 'Everything in Basic + one custom automation built for you each month.',
    stars: 900,
    kind: 'sub',
  },
};

function isConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && String(process.env.TELEGRAM_BOT_TOKEN).trim());
}

function listPlans() {
  return Object.entries(PLANS).map(([key, plan]) => ({ key, ...plan }));
}

function getPlan(key) {
  return PLANS[key] || null;
}

function parsePayload(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const m = /^plan_([a-z0-9_]+)$/i.exec(payload.trim());
  if (!m) return null;
  const key = m[1].toLowerCase();
  const plan = PLANS[key];
  if (!plan) return null;
  return { key, plan };
}

function buildPayload(key) {
  return `plan_${key}`;
}

/**
 * Send an XTR invoice for a blueprint/subscription plan into the chat.
 */
async function sendPlanInvoice(bot, chatId, planKey) {
  const plan = getPlan(planKey);
  if (!plan) throw new Error(`Unknown blueprint plan: ${planKey}`);
  if (!isConfigured()) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const telegram = bot.telegram || bot;
  return telegram.sendInvoice(chatId, {
    title: plan.title,
    description: plan.desc,
    payload: buildPayload(planKey),
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: plan.title, amount: plan.stars }],
  });
}

/**
 * CreateInvoiceLink for the same plan (no payment — link creation only).
 */
async function createPlanInvoiceLink(bot, planKey) {
  const plan = getPlan(planKey);
  if (!plan) throw new Error(`Unknown blueprint plan: ${planKey}`);
  if (!isConfigured()) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const telegram = bot.telegram || bot;
  return telegram.createInvoiceLink({
    title: plan.title,
    description: plan.desc,
    payload: buildPayload(planKey),
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: plan.title, amount: plan.stars }],
  });
}

/**
 * Deliver after successful_payment.
 */
async function deliver(bot, chatId, planKey) {
  const plan = getPlan(planKey);
  const telegram = bot.telegram || bot;
  if (plan && plan.kind === 'file') {
    await telegram.sendDocument(chatId, PRODUCT_FILE);
    await telegram.sendMessage(
      chatId,
      'وصلتك الحزمة ✅\n\nابدأ بالصفحة 2: كيف تستخدمها. اختر مخططا واحدا يناسب عميلا تعرفه، وانسخ الـPrompt كما هو.\n\nEN: Blueprint pack delivered. Start on page 2 — pick one automation and copy the prompt as-is.'
    );
    return { delivered: 'file', planKey };
  }
  await telegram.sendMessage(
    chatId,
    `تم تفعيل اشتراكك ✅\n\nالباقة: ${plan ? plan.title : planKey}\nاكتب /start في أي وقت.\n\nEN: Subscription activated: ${plan ? plan.title : planKey}.`
  );
  return { delivered: 'sub', planKey };
}

module.exports = {
  PLANS,
  PRODUCT_FILE,
  isConfigured,
  listPlans,
  getPlan,
  parsePayload,
  buildPayload,
  sendPlanInvoice,
  createPlanInvoiceLink,
  deliver,
};
