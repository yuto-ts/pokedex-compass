import type { Metadata } from 'next';
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
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
