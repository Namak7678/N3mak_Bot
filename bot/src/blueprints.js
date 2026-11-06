/**
 * Digital blueprint pack sold for Telegram Stars (XTR).
 * Ported from Namak7678/n3mak-bot-live (450⭐ PDF pack + optional monthly plans).
 *
 * Payload format: plan_<key>  e.g. plan_pack
 * Currency: XTR, empty provider_token.
 *
 * PDF is self-hosted under bot/assets/ (not Base44). After the first
 * successful sendDocument we cache Telegram's file_id for faster re-sends.
 */

const fs = require('fs');
const path = require('path');

const LOCAL_PDF = path.join(__dirname, '..', 'assets', 'AI-Automation-Blueprints.pdf');
const FILE_ID_CACHE = path.join(__dirname, '..', 'assets', '.blueprint-file-id');
const LOCAL_PDF_B64 = path.join(__dirname, '..', 'assets', 'AI-Automation-Blueprints.pdf.b64');

/** Materialize the PDF from the committed .b64 sidecar if the binary is missing. */
function ensureLocalPdf() {
  if (fs.existsSync(LOCAL_PDF)) return LOCAL_PDF;
  if (!fs.existsSync(LOCAL_PDF_B64)) {
    throw new Error(`Blueprint PDF missing at ${LOCAL_PDF} (and no .b64 sidecar)`);
  }
  const b64 = fs.readFileSync(LOCAL_PDF_B64, 'utf8').replace(/\s+/g, '');
  fs.mkdirSync(path.dirname(LOCAL_PDF), { recursive: true });
  fs.writeFileSync(LOCAL_PDF, Buffer.from(b64, 'base64'));
  return LOCAL_PDF;
}


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

function readCachedFileId() {
  try {
    if (!fs.existsSync(FILE_ID_CACHE)) return null;
    const id = fs.readFileSync(FILE_ID_CACHE, 'utf8').trim();
    return id || null;
  } catch {
    return null;
  }
}

function writeCachedFileId(fileId) {
  try {
    fs.writeFileSync(FILE_ID_CACHE, String(fileId).trim() + '\n', 'utf8');
  } catch (err) {
    console.error('[blueprints] failed to cache file_id:', err.message);
  }
}

/**
 * Send the self-hosted PDF. Prefer cached Telegram file_id; else upload local file.
 */
async function sendPackDocument(bot, chatId) {
  const telegram = bot.telegram || bot;
  ensureLocalPdf();
  if (!fs.existsSync(LOCAL_PDF)) {
    throw new Error(`Blueprint PDF missing at ${LOCAL_PDF}`);
  }
  const cached = readCachedFileId();
  let msg;
  if (cached) {
    try {
      msg = await telegram.sendDocument(chatId, cached, {
        filename: 'AI-Automation-Blueprints.pdf',
      });
    } catch (err) {
      console.warn('[blueprints] cached file_id failed, re-uploading:', err.message);
      msg = null;
    }
  }
  if (!msg) {
    msg = await telegram.sendDocument(
      chatId,
      { source: fs.createReadStream(LOCAL_PDF), filename: 'AI-Automation-Blueprints.pdf' },
      { caption: '10 AI Automation Blueprints (PDF)' }
    );
  }
  const fileId = msg?.document?.file_id;
  if (fileId && fileId !== cached) writeCachedFileId(fileId);
  return { fileId: fileId || cached || null, message: msg };
}

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

async function deliver(bot, chatId, planKey) {
  const plan = getPlan(planKey);
  const telegram = bot.telegram || bot;
  if (plan && plan.kind === 'file') {
    await sendPackDocument(bot, chatId);
    await telegram.sendMessage(
      chatId,
      'وصلتك الحزمة ✅\n\nابدأ بالصفحة 2: كيف تستخدمها. اختر مخططا واحدا يناسب عميلا تعرفه، وانسخ الـPrompt كما هو.\n\nEN: Blueprint pack delivered. Start on page 2 — pick one automation and copy the prompt as-is.'
    );
    return { delivered: 'file', planKey, source: 'local-assets' };
  }
  await telegram.sendMessage(
    chatId,
    `تم تفعيل اشتراكك ✅\n\nالباقة: ${plan ? plan.title : planKey}\nاكتب /start في أي وقت.\n\nEN: Subscription activated: ${plan ? plan.title : planKey}.`
  );
  return { delivered: 'sub', planKey };
}

module.exports = {
  PLANS,
  LOCAL_PDF,
  PRODUCT_FILE: LOCAL_PDF, // backward-compat alias
  isConfigured,
  listPlans,
  getPlan,
  parsePayload,
  buildPayload,
  sendPlanInvoice,
  createPlanInvoiceLink,
  sendPackDocument,
  deliver,
};
