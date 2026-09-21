# DEX COMPASS

Pokémon HOME で全国図鑑 1,025 種を集める人のための、非公式の収集管理ツールです。捕まえたか・HOME に送ったか・図鑑登録したかを 1 種ずつ記録し、所持ソフトから「次に何をどこで捕まえるか」を出します。

## できること

- **図鑑**: 全 1,025 種を日本語・ひらがな・英語・番号で検索し、タイプ・世代・分類・収集状況・入手条件・難易度で絞り込む
- **記録**: 捕獲・HOME 送信・図鑑登録・Living Dex・フォルム・大切な旧作個体を別々にチェックする
- **攻略**: 所持ソフトと DLC に合わせた作品別の入手ルート、おすすめの比較、作品ごとのチェックリスト
- **残り**: 不足数、世代・分類別の残り、Pokémon Bank 終了への対策
- **相談**: 右端のチャットから、手元の `claude` / `codex` CLI に自分の記録とサイトのデータを踏まえて質問する

## 3 つの使い方

| 形 | 記録の保存先 | 向き |
| --- | --- | --- |
| サイト版（Cloudflare Workers + D1、Cloudflare Access で保護） | サーバー。複数の端末で同じ記録 | 自分でデプロイして日常的に使う |
| 単一 HTML 版（`dist-html/index.html`） | 開いたブラウザの localStorage | ファイル 1 つで手軽に試す |
| ローカル（`corepack pnpm dev`） | Miniflare のローカル DB | 開発 |

手順は [docs/operations.md](docs/operations.md) にあります。

## 開発

```bash
corepack pnpm install
```

```bash
corepack pnpm dev
```

変更後は `corepack pnpm test`、`corepack pnpm exec tsc --noEmit`、`corepack pnpm lint`、`corepack pnpm build`、`corepack pnpm build:html` を通します。

React / TypeScript / Tailwind CSS / shadcn/ui で書き、Vinext（Next.js App Router 互換）で動かしています。Next.js 本体は使いません。パッケージマネージャーは pnpm 12.3.4（corepack 経由）です。

## リポジトリの構成

| 場所 | 内容 |
| --- | --- |
| `app/` | ページと `/api/state` |
| `components/` | UI。`components/chat/` がチャット欄 |
| `lib/` | 図鑑エンジン（`dex.ts`）、状態モデル（`state.ts`）、保存（`storage.ts`）、チャットに渡す文書の生成（`lib/chat/`） |
| `data/` | 図鑑・進化・入手ルートの JSON |
| `standalone/` | 単一 HTML 版のエントリーとシム |
| `chat/` | ブリッジ（Node 標準モジュールのみ）、システムプロンプト、skill、設定 |
| `scripts/` | データの取り込み、単一 HTML のビルド、エンジンの検証、テスト用の偽 CLI |
| `docs/` | 運用ガイドと設計書 |

## ドキュメント

- [docs/operations.md](docs/operations.md): 起動・デプロイ・チャットの設定・保存の仕組み
- [docs/data.md](docs/data.md): データの出典と限界
- [docs/chat-sidebar.md](docs/chat-sidebar.md): チャット欄の設計書

## 出典と権利

- 図鑑・進化・旧作の出現: [PokeAPI](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv)、画像は [PokeAPI/sprites](https://github.com/PokeAPI/sprites)
- Switch 作品の入手場所: Serebii。詳細は各ルートの `source`
- Bank 終了告知: https://www.pokemon.co.jp/info/2022/02/220216_gm01.html?rss=260813

非公式のファンメイドツールです。Pokémon © Nintendo / Creatures / GAME FREAK。
