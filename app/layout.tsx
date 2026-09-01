import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '词语接龙 · 小组PK赛',
  description: '适合三年级语文课堂的词语与成语接龙互动工具。',
  openGraph: {
    title: '词语接龙 · 小组PK赛',
    description: '开动脑筋，把词语一个个接起来！',
    type: 'website',
    locale: 'zh_CN',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 675,
        alt: '词语接龙 · 小组PK赛',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '词语接龙 · 小组PK赛',
    description: '开动脑筋，把词语一个个接起来！',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
