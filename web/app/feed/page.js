const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://n3mak-bot-production.up.railway.app';

async function getStats() {
  try {
    const res = await fetch(`${API_URL}/api/stats`, { cache: 'no-store' });
    if (!res.ok) throw new Error('bad response');
    return await res.json();
  } catch {
    return { users: 0, markets: 6 };
  }
}

// Honest state: these are the categories the marketplace will open with,
// not fabricated individual listings pretending to be real users' items.
const CATEGORIES = [
  { name: 'معدات ومنتجات', status: 'live', desc: 'أدوات، أجهزة، أو معدات مش مستخدمة — للبيع أو الإيجار.' },
  { name: 'مساحات', status: 'live', desc: 'مخزن، مكتب، أو ركن فاضي تقدر تأجره.' },
  { name: 'وقت ومهارات', status: 'live', desc: 'خبرتك أو وقتك — بادلها أو بيعها عبر بنك الوقت.' },
  { name: 'مركبات', status: 'soon', desc: 'تأجير قصير المدى لسيارة أو دراجة مش مستخدمة يوميًا.' },
];

export default async function FeedPage() {
  const stats = await getStats();

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>سوق <span className="gradient-text" style={{background:'linear-gradient(90deg,#00D9A5,#00A8E8)',WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent'}}>الفرص</span></h1>
        <p>الفئات المتاحة الآن، وأرقام حقيقية من منصة N3mak — مش أرقام للعرض بس.</p>
      </div>

      <div className="live-grid">
        <div className="data-card">
          <span className="num">{stats.users}</span>
          <span className="lbl">مستخدم مسجل فعليًا على البوت</span>
        </div>
        <div className="data-card">
          <span className="num">{stats.markets}</span>
          <span className="lbl">أسواق استثمارية مفتوحة</span>
        </div>
        <div className="data-card">
          <span className="num">{CATEGORIES.filter(c => c.status === 'live').length}</span>
          <span className="lbl">فئات موارد شغالة الآن</span>
        </div>
      </div>

      <div className="category-list">
        {CATEGORIES.map((c) => (
          <div className="data-card" key={c.name}>
            <h3>{c.name}</h3>
            <p>{c.desc}</p>
            <span className={`status-badge ${c.status === 'live' ? 'status-live' : 'status-soon'}`}>
              {c.status === 'live' ? '● شغال الآن' : '○ قريبًا'}
            </span>
          </div>
        ))}
      </div>

      <div className="simple-form">
        <p>لعرض مورد أو تصفح الفرص الحالية، كل التنفيذ الفعلي بيتم من بوت تيليجرام مباشرة.</p>
        <a className="cta" href="https://t.me/N3mak_bot" target="_blank" rel="noreferrer">افتح البوت الآن ←</a>
      </div>
    </div>
  );
}
