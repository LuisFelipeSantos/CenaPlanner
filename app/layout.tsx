import type { Metadata } from 'next';
import type { Viewport } from 'next';
import { Geist } from 'next/font/google';
import PwaRegistration from './pwa-registration';
import './globals.css';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
export const metadata: Metadata = {
  title: 'CenaPlanner — Finanças pessoais',
  description: 'Organize receitas, contas e despesas mensais em um só lugar.',
  applicationName: 'CenaPlanner',
  manifest: '/manifest.webmanifest?v=1',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'CenaPlanner',
    statusBarStyle: 'default',
  },
};
export const viewport: Viewport = {
  themeColor: '#184e3a',
  colorScheme: 'light',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${geist.variable} antialiased`}>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
