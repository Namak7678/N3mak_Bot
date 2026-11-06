import './globals.css';

export const metadata = {
  title: 'N3mak AI Gateway — Pioneer $3',
  description: 'Multi-model AI gateway via OmniRoute. Key delivered via @N3mak_bot within a few hours.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'system-ui, Tahoma, Arial, sans-serif', background: '#0B1220', color: '#fff' }}>
        {children}
      </body>
    </html>
  );
}
