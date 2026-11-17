const cron = require('node-cron');

const RADAR_SITE = 'https://namak7678.github.io/n3mak-radar/';
const RADAR_INDEX = 'https://raw.githubusercontent.com/Namak7678/n3mak-exposure-index/main/data/latest.json';
const RADAR_SOURCE = 'https://github.com/Namak7678/n3mak-exposure-index';

const COUNTRY_NAMES = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom', DE: 'Germany',
  IN: 'India', ES: 'Spain', MY: 'Malaysia', MX: 'Mexico', AU: 'Australia',
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', NL: 'Netherlands',
};

async function getRadarSnapshot() {
  const response = await fetch(RADAR_INDEX, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Radar index HTTP ${response.status}`);
  const snapshot = await response.json();
  if (!snapshot || !Array.isArray(snapshot.countries) || !snapshot.updated) {
    throw new Error('Radar index has an unexpected format');
  }
  const countries = snapshot.countries
    .filter((item) => item && /^[A-Z]{2}$/.test(item.country) && Number.isFinite(Number(item.victims)))
    .sort((a, b) => Number(b.victims) - Number(a.victims));
  if (!countries.length) throw new Error('Radar index contains no country data');
  return { updated: snapshot.updated, countries };
}

function updatedLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'latest available snapshot';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

function countryName(code) {
  return COUNTRY_NAMES[code] || code;
}

function buildSnapshotPost(snapshot) {
  const top = snapshot.countries.slice(0, 5);
  const total = snapshot.countries.reduce((sum, item) => sum + Number(item.victims), 0);
  const lines = top.map((item, index) =>
    `${index + 1}. ${countryName(item.country)} — ${Number(item.victims)} listings`
  );
  return [
    '🌍 N3mak Radar24 | GLOBAL EXPOSURE BRIEF',
    `Updated: ${updatedLabel(snapshot.updated)}`,
    '',
    `The current public index tracks ${total} listings across ${snapshot.countries.length} countries.`,
    ...lines,
    '',
    'Important: these figures reflect entries in public ransomware leak-site sources. They are not independent confirmation of an intrusion or proof that a network was compromised.',
    '',
    '🔎 Explore the dashboard and methodology:',
    RADAR_SITE,
    '',
    '📡 Follow N3mak Radar24 for the next intelligence update. Forward this brief to your security team.',
    'العربية: هذه أرقام لرصد منشورات مواقع تسريب الفدية العامة، وليست تأكيداً مستقلاً لوقوع اختراق تقني.',
  ].join('\n');
}

function buildSpotlightPost(snapshot) {
  const leader = snapshot.countries[0];
  return [
    '⚠️ RADAR24 COUNTRY WATCH',
    `Current leading country in the public exposure index: ${countryName(leader.country)} (${Number(leader.victims)} listings).`,
    `Snapshot time: ${updatedLabel(snapshot.updated)}`,
    '',
    'A listing is an exposure signal that needs verification. Do not treat it alone as proof of a successful cyber intrusion.',
    '',
    'See the country breakdown and source notes:',
    RADAR_SITE,
    '',
    'Follow and share N3mak Radar24 with your security network.',
    'متابعة المؤشرات حسب الدولة متاحة في لوحة Radar24.',
  ].join('\n');
}

function buildActionPost() {
  return [
    '🛡️ 60-SECOND SECURITY CHECK',
    'Can your organization restore its critical data without reconnecting compromised systems?',
    '',
    'Check three things today:',
    '1. Keep at least one backup isolated from the production network.',
    '2. Test a real restore, not just the backup job status.',
    '3. Review who can delete or modify backup copies.',
    '',
    'Radar24 tracks public ransomware exposure signals. Use the dashboard for the latest country-level view:',
    RADAR_SITE,
    '',
    '📡 Follow N3mak Radar24 and forward this checklist to your IT team.',
    'اختبر استعادة نسخة احتياطية معزولة، ولا تكتفِ بالتأكد من نجاح عملية النسخ.',
  ].join('\n');
}

const POST_BUILDERS = [
  (snapshot) => buildSnapshotPost(snapshot),
  (snapshot) => buildSpotlightPost(snapshot),
  () => buildActionPost(),
];

let cursor = 0;

function startScheduledPosts(bot) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    console.log('[scheduler] TELEGRAM_CHANNEL_ID not set — auto-posting disabled');
    return;
  }

  // Three Radar24 posts daily: 09:00, 15:00 and 21:00 Riyadh time.
  cron.schedule('0 6,12,18 * * *', async () => {
    try {
      let snapshot = null;
      try {
        snapshot = await getRadarSnapshot();
      } catch (err) {
        console.error('[radar] snapshot unavailable; using evergreen security post:', err.message);
      }
      const builder = snapshot ? POST_BUILDERS[cursor % POST_BUILDERS.length] : POST_BUILDERS[2];
      cursor += 1;
      const text = builder(snapshot);
      await bot.telegram.sendMessage(channelId, text, {
        disable_web_page_preview: false,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Open Radar24 Dashboard', url: RADAR_SITE }],
            [{ text: '📤 Share Radar24', url: 'https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fn3makradar24&text=Follow%20N3mak%20Radar24%20for%20global%20cyber%20threat%20intelligence' }],
          ],
        },
      });
      console.log('[scheduler] Radar24 post published');
    } catch (err) {
      console.error('[scheduler] Radar24 post failed:', err.message);
    }
  });

  console.log(`[scheduler] Radar24 auto-posting enabled for configured channel (06/12/18 UTC)`);
}

module.exports = { startScheduledPosts, getRadarSnapshot, buildSnapshotPost, buildSpotlightPost, buildActionPost };
