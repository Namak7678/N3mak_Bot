export function FeaturePage({ icon, title, tagline, roadmap }) {
  return (
    <div className="wrap">
      <div className="page-head">
        <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
        <h1>{title}</h1>
        <p>{tagline}</p>
        <span className="status-badge status-soon" style={{ marginTop: 16 }}>○ قيد التطوير الفعلي</span>
      </div>
      <div className="roadmap-box data-card">
        <h3 style={{ color: '#fff', marginTop: 0 }}>هيشتغل إزاي لما يخلص:</h3>
        <ul>
          {roadmap.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
      <div className="simple-form">
        <p>عايز تتابع تفعيل الميزة دي أول ما تشتغل؟ تابعنا على تيليجرام.</p>
        <a className="cta" href="https://t.me/N3mak_bot" target="_blank" rel="noreferrer">تابع على تيليجرام ←</a>
      </div>
    </div>
  );
}
