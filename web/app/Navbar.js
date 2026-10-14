const BOT_URL = 'https://t.me/N3mak_bot';
const PIONEER_URL = 'https://whop.com/checkout/plan_n2uiwphhI5YG7';
const STARTER_URL = 'https://whop.com/checkout/plan_IkWmnOwW1ShYY';

const LINKS = [
  { href: '/feed', label: 'الفرص' },
  { href: '/analyze', label: 'التحليل' },
  { href: '/spatial', label: 'الخريطة' },
  { href: '/predictor', label: 'التنبؤ' },
  { href: '/negotiator', label: 'التفاوض' },
  { href: '/timebank', label: 'بنك الوقت' },
];

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="wrap navbar-inner">
        <a href="/" className="brand">✨ N3mak <span className="v2">2.0</span></a>
        <div className="nav-links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </div>
        <div className="nav-cta">
          <a href={PIONEER_URL} target="_blank" rel="noreferrer" className="btn-pill" style={{background:'#F5C451',color:'#1A1203'}}>🛒 $3</a>
          <a href={STARTER_URL} target="_blank" rel="noreferrer" className="btn-pill" style={{background:'#00C8B4',color:'#0A0E1C'}}>$9</a>
          <a href={BOT_URL} target="_blank" rel="noreferrer" className="btn-pill">البوت</a>
          <a href="/login">تسجيل الدخول</a>
          <a href="/register" className="btn-pill">إنشاء حساب</a>
        </div>
      </div>
    </nav>
  );
}
