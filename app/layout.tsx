import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
export const metadata: Metadata = { title: 'Meu Controle — Finanças pessoais', description: 'Organize receitas, contas e despesas mensais em um só lugar.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body className={`${geist.variable} antialiased`}>{children}</body></html>; }
