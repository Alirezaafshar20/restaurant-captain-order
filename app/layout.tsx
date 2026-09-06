import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'MOYA | کاپیتان سفارش',
  description: 'منوی مویا و همراه تجربهٔ مهمان‌نوازی',
  robots: { index: false, follow: false },
  icons: { icon: '/moya-icon.svg' },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
