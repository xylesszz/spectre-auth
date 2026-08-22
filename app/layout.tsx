import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // <--- Deve ser './globals.css' se o arquivo está na mesma pasta

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SPECTRE AUTH',
  description: 'Private Authentication & Licensing Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}