const PIONEER = 'https://whop.com/checkout/plan_n2uiwphhI5YG7';
const STARTER = 'https://whop.com/checkout/plan_IkWmnOwW1ShYY';
const PRO = 'https://whop.com/checkout/plan_SrqGnbkktuOUc';
const BOT = 'https://t.me/N3mak_bot';

export const metadata = {
  title: 'N3mak AI Gateway — Pioneer $3',
  description: 'Multi-model AI gateway via OmniRoute. Key delivered via @N3mak_bot within a few hours.',
};

export default function HomePage() {
  return (
    <main style={{margin:0,fontFamily:'system-ui,sans-serif',background:'#0B1220',color:'#fff',minHeight:'100vh'}}>
      <div style={{maxWidth:720,margin:'0 auto',padding:'48px 20px'}}>
        <div style={{background:'#0F1B2D',border:'2px solid #F5C451',borderRadius:20,padding:32}}>
          <h1 style={{fontSize:'2rem',margin:'0 0 12px'}}>N3mak AI Gateway</h1>
          <p style={{color:'#CBD5E1',lineHeight:1.6}}>
            بوابة نماذج AI متعددة عبر OmniRoute — يصلك المفتاح عبر @N3mak_bot خلال ساعات قليلة بعد الدفع على Whop.
          </p>
          <div style={{display:'inline-block',background:'#F5C451',color:'#1A1203',fontWeight:800,fontSize:'1.6rem',padding:'8px 18px',borderRadius:12,margin:'16px 0'}}>
            Pioneer $3
          </div>
          <a href={PIONEER} style={btn('#F5C451','#1A1203')}>اشترِ Pioneer — $3</a>
          <a href={STARTER} style={btn('#00C8B4','#0A0E1C')}>Starter — $9 · FIRST9=$6</a>
          <a href={PRO} style={btn('#1E293B','#fff',true)}>Pro — $49</a>
          <p style={{color:'#CBD5E1',opacity:0.85}}>
            Promo <b>FIRST9</b> — $3 off Starter · Bot <a href={BOT} style={{color:'#93C5FD'}}>@N3mak_bot</a> → /buy
          </p>
          <a href={BOT} style={btn('#1E293B','#fff',true)}>تيليجرام @N3mak_bot</a>
        </div>
      </div>
    </main>
  );
}

function btn(bg, color, border) {
  return {
    display: 'block',
    textAlign: 'center',
    background: bg,
    color,
    textDecoration: 'none',
    fontWeight: 700,
    padding: 16,
    borderRadius: 12,
    margin: '10px 0',
    border: border ? '1px solid #64748B' : undefined,
  };
}
