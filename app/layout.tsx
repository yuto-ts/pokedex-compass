import type { Metadata } from 'next';
import ChatDock from '@/components/chat/chat-dock';
import { prePaintScript } from '@/lib/chat/layout';
import './globals.css';
export const metadata: Metadata = {
  title: 'DEX COMPASS | 全国図鑑コンプリート',
  description:
    '所持ソフトからおすすめ入手ルートを見つける、Pokémon HOME全国図鑑管理ツール。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The pre-paint script adds the chat-open class before hydration.
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaintScript }} />
      </head>
      <body>
        {children}
        <ChatDock />
      </body>
    </html>
  );
}
