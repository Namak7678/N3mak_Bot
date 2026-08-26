import './globals.css';

export const metadata = {
  title: 'N3mak — سوق الموارد الذكي والاستثمار العالمي',
  description: 'حوّل مواردك غير المستغلة إلى فرص، واستثمر في أسواق عالمية — كله بذكاء اصطناعي وأونلاين بالكامل.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'Tahoma, Arial, sans-serif', background: '#0B1F3A', color: '#fff' }}>
        {children}
      </body>
    </html>
  );
}
