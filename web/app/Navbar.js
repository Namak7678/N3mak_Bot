const BOT_URL = 'https://t.me/N3mak_bot';

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
          <a href="/login">تسجيل الدخول</a>
          <a href="/register" className="btn-pill">إنشاء حساب</a>
        </div>
      </div>
    </nav>
  );
}
