const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://n3mak-bot-production.up.railway.app';
const BOT_URL = 'https://t.me/N3mak_bot';

async function getStats() {
  try {
    const res = await fetch(`${API_URL}/api/stats`, { next: { revalidate: 30 } });
    if (!res.ok) throw new Error('bad response');
    return await res.json();
  } catch {
    return { users: 0, markets: 6 };
  }
}

const FEATURES = [
  { icon: '🧠', title: 'تحليل ذكي', desc: 'تقييم فوري لقيمة المورد وأفضل سعر عادل له باستخدام الذكاء الاصطناعي.' },
  { icon: '🤝', title: 'مفاوض آلي', desc: 'وكيل ذكاء اصطناعي يتفاوض نيابة عنك مع المهتمين للوصول لأفضل صفقة.' },
  { icon: '🔮', title: 'توقيت البيع', desc: 'توقع الوقت الأنسب لعرض موردك بناءً على الطلب الفعلي في السوق.' },
  { icon: '⏳', title: 'بنك الوقت', desc: 'بادل وقتك ومهاراتك مباشرة مع غيرك، من غير ما تحتاج فلوس تتحرك.' },
  { icon: '🛡️', title: 'ضمان المعاملة', desc: 'حماية طرفي الصفقة لحد ما يتسلم كل واحد حقه بالكامل.' },
  { icon: '💬', title: 'كل حاجة من تيليجرام', desc: 'اعرض، فاوض، وتابع صفقاتك من نفس البوت — من غير تطبيقات إضافية.' },
];

export default async function Home() {
  const stats = await getStats();

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <span className="eyebrow">N3MAK — منصة واحدة، بابين</span>
          <h1>حوّل مواردك الخاملة إلى دخل، واستثمر في أسواق العالم</h1>
          <p className="lead">
            سوق موارد ذكي يقيّم ويفاوض عنك بالذكاء الاصطناعي، وبوابة استثمار تغطي
            أمريكا وأوروبا والخليج وبريطانيا وروسيا وأفريقيا — كله أونلاين، من تيليجرام مباشرة.
          </p>
          <a className="cta" href={BOT_URL} target="_blank" rel="noreferrer">
            ابدأ الآن على تيليجرام ←
          </a>

          <div className="stats-bar">
            <div className="stat">
              <span className="num">{stats.users}</span>
              <span className="label">مستخدم مسجل فعليًا</span>
            </div>
            <div className="stat">
              <span className="num">{stats.markets}</span>
              <span className="label">أسواق استثمارية مفتوحة</span>
            </div>
            <div className="stat">
              <span className="num">24/7</span>
              <span className="label">تشغيل بلا توقف</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>خدمتان، منطق واحد</h2>
          <p className="sub">مش لازم تختار — المنصة مبنية على إن قيمتك المالية جوة موردك وجوة استثمارك مع بعض.</p>
          <div className="services">
            <div className="service-card marketplace">
              <h3>🛍️ سوق الموارد الذكي</h3>
              <p>
                عندك معدة، وقت، مساحة، أو مهارة مش مستغلة؟ الذكاء الاصطناعي بيقيّمها،
                بيلاقيلها مشتري أو مستأجر مناسب، وبيتفاوض نيابة عنك لحد ما توصل لأفضل سعر.
              </p>
            </div>
            <div className="service-card invest">
              <h3>💰 منصة الاستثمار العالمي</h3>
              <p>
                حوّل نفس القيمة دي لاستثمار حقيقي في أسواق عالمية متعددة، بعملات مختلفة
                (USD, AED وغيرها)، وتابع محفظتك من نفس مكان واحد.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="wrap">
          <h2>إمكانيات سوق الموارد</h2>
          <p className="sub">كل ميزة هنا بتتفعّل تدريجيًا مع نمو المنصة — وده اللي شغال فعليًا دلوقتي وجاري تطويره.</p>
          <div className="grid">
            {FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <span className="icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          N3mak © {new Date().getFullYear()} — تواصل عبر <a href={BOT_URL}>@N3mak_bot</a>
        </div>
      </footer>
    </>
  );
}
