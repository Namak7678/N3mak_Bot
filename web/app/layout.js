import './globals.css';
import Navbar from './Navbar';

export const metadata = {
  title: 'N3mak AI Gateway — Pioneer $3',
  description: 'Multi-model AI gateway. Key delivered via @N3mak_bot within a few hours.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'system-ui, Tahoma, Arial, sans-serif', background: '#0B1220', color: '#fff' }}>
        <Navbar />
        {children}
        <footer>
          <div className="wrap">
            <a href="/">N3mak</a>
            {' · '}
            <a href="/playground">Playground · جرّب</a>
            {' · '}
            <a href="/docs">API docs · توثيق الواجهة</a>
            {' · '}
            <a href="https://t.me/N3mak_bot" target="_blank" rel="noreferrer">@N3mak_bot</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
