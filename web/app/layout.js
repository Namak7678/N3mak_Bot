import './globals.css';

export const metadata = {
  title: 'N3mak AI Gateway — Pioneer $3',
  description: 'Multi-model AI gateway via OmniRoute. Instant Telegram key after Whop checkout.',
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
