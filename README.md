# DEX COMPASS

全国図鑑 1,025 種を対象にした、Pokémon HOME の収集支援ツールです。

## できること

- 全 1,025 種を日本語・ひらがな・英語・図鑑番号で検索し、タイプ・世代・分類・収集状況・入手条件・難易度で絞り込む
- 捕獲・HOME 送信・図鑑登録・Living Dex・フォルムを別々に記録する
- 所持ソフトと DLC に応じた作品別の入手ルート、おすすめ比較、作品ごとの攻略チェックリスト
- 不足数と世代・分類別の残り、Bank 終了対策、大切な旧作個体の印
- カード／表表示、スマートフォン対応、サーバー不要の単一 HTML 版

## 開発

pnpm 12.3.4 を corepack 経由で使います。

```bash
corepack pnpm install
```

```bash
corepack pnpm dev
```

検証は次の 5 つをすべて通します。`test` は図鑑エンジンの確認（`scripts/check-engine.mjs`）と、偽 CLI（`scripts/fake-claude.mjs`、`scripts/fake-codex.mjs`）を使ったチャットブリッジのテスト（`chat/bridge/*.test.mjs`）です。

```bash
corepack pnpm test && corepack pnpm exec tsc --noEmit && corepack pnpm lint && corepack pnpm build && corepack pnpm build:html
```

React / TypeScript / Tailwind CSS / shadcn/ui で、Sites 標準の Vinext 上に Next.js App Router 互換 API で実装しています。Next.js 本体の実行環境ではありません。

## 単一 HTML 版

`corepack pnpm build:html` が `dist-html/index.html` を生成します。画面・CSS・JavaScript・図鑑データを 1 ファイルに内蔵し、サーバーなしで開けます。エントリーは `standalone/main.tsx` で、ページ移動は `#/routes` や `#/pokemon/25` のようなハッシュです。`next/link`・`next/image` は `standalone/` のシム、`@/lib/href` は `standalone/href.ts` に差し替えてビルドします（`scripts/build-html.mjs`）。

記録は開いたブラウザの localStorage（キー `dex-compass-v1`）に入り、サイト版とは別で自動移行もされません。`file://` での保存はブラウザ依存で、HTML の移動・別ブラウザでの利用・閲覧データの削除で以前の記録が見えなくなることがあります。ポケモン画像は PokeAPI から取得するので、表示にはインターネット接続が要ります。

## データの範囲と限界

| 内容 | 出典 | 場所 |
| --- | --- | --- |
| 基本情報・フォルム・進化条件 | PokeAPI の公開 CSV | `data/pokemon.json`、`data/evolution.json` |
| 旧作の通常草むら出現 | PokeAPI の encounters | `data/routes.json`（時間帯などの細部は出典を参照） |
| Switch 作品の入手場所 | Serebii 各ページの Locations 表 | `data/modern-routes.json`（固定出現を推測せず、条件の原文とリンクを保持。地名・条件の一部は英語） |
| 手動で確認したルート | 各ルートの `source` | `lib/dex.ts`（出典と DLC・通信・移送条件を明記） |

確認日は 2026-09-08 で、取得失敗と未対応ページは `data/import-report.json` に記録しています。

全作品の全入手方法を検証したデータベースではなく、未収録のものを入手不可とは扱いません。フォルム一覧と進化条件も網羅ではないので、特殊な判定は出典で確認してください。★評価は目安で、最短攻略は収録済みルートの優先順位比較と作品別のまとめであり、ストーリー進行・確率・実測時間を含む最適化ではありません。過去の配布は現在のおすすめに出さず、幻の自動取得ルートは `needsReview` でおすすめから外せます。準伝説は便宜的な分類です。

## 保存

状態モデルと検証は `lib/state.ts`、保存の I/O は `lib/storage.ts` が担当します（schema version 1）。サイト版の保存先は `/api/state`（`app/api/state/route.ts`）経由の Cloudflare D1 で、`state` テーブル 1 行に書き、テーブルは初回アクセス時に作られます。保存のたびに revision を照合するので、他の端末が先に更新していれば 409 で上書きを止め、画面は再読み込みを促す表示に変わります。単一 HTML 版の保存先は `standalone/storage.ts` が扱う localStorage で、破損データは上書きせずエラー表示です。

## ポケモン相談チャット（右サイドバー）

右端のチャット欄から、この Mac で動く `claude` CLI（Claude のサブスクリプション）か `codex` CLI（ChatGPT のサブスクリプション）に質問できます。API キーは使いません。設計と細かい挙動は [docs/chat-sidebar.md](docs/chat-sidebar.md) にあります。

1. 使う CLI にログインしておきます（`claude -p "hi"` が返れば可。ChatGPT 側なら `codex` も）。
2. `corepack pnpm chat` を実行します。ブリッジが `http://127.0.0.1:47117` で待ち受け、接続トークンを表示します（`chat/workspace/.token` にも保存）。
3. サイト右端の「チャット」を開き、トークンを 1 回入力します。トークンはそのブラウザの localStorage に残ります。
4. https のサイト版では、初回接続時に Chrome の「ローカル ネットワークへのアクセス」ダイアログが出るので「許可」を押します。

主なファイルは、システムプロンプト `chat/prompts/system.md`、skill `chat/skills/`（ユーザーの記録とサイトのデータの調べ方）、設定 `chat/config.json`（ポート・許可 Origin・モデル一覧）です。プロンプトと skill の変更は次の質問から反映されます。サイト版のドメインは `allowedOrigins` に足し、単一 HTML 版（`file://`）から使うときは `allowNullOrigin` を `true` にします。AI が読むのは、ブラウザが送った収集状況・おすすめルート・Bank 対策（`chat/workspace/contexts/`）と、起動時に生成する作品別の入手方法・進化条件・サイト説明（`chat/workspace/reference/`、約 4 MB）です。

iPhone など同じ tailnet（Tailscale）の端末から使うときは、待ち受けアドレスと許可 Origin を足してブリッジを起動し、開発サーバーも同じアドレスで待ち受けます。端末のブラウザで `http://<tailscale の IP>:3000/` を開いて同じトークンを入れれば使えます。MagicDNS の名前ではなく IP で開いてください（Vite のホスト検査）。

```bash
CHAT_BRIDGE_HOSTS=$(tailscale ip -4) CHAT_ALLOWED_ORIGINS=http://$(tailscale ip -4):3000 corepack pnpm chat
```

```bash
corepack pnpm dev -- -H $(tailscale ip -4)
```

制約:

- ブリッジはこの Mac で動きます。Cloudflare 上のサイト版でも、ブラウザと同じ Mac（または tailnet 越しの同じ Mac）のブリッジにつなぎます。`0.0.0.0` では待ち受けず、守りはトークン・Origin 許可リスト・Host 検査の 3 つです。
- 履歴は `chat/workspace/history/` に Mac ごとに残り、`chat/workspace/` は git 管理外です。
- 対応ブラウザは Chrome です。同時に生成できる回答は 1 件で、1 回の回答は 180 秒で打ち切ります。
- Codex は段落単位の表示になり、読み取り専用サンドボックスのため作業フォルダの外のファイルも読めます。
- 質問ごとに `claude -p` を新しい作業ディレクトリで起動するため、`~/.claude/projects/` にジョブごとのディレクトリが増えます。

## Cloudflare へのデプロイ

`corepack pnpm run deploy` でビルドし、Worker `pokedex-compass` としてデプロイします。D1 の接続先は `vite.config.ts` の `d1_databases` です。アクセス制限は Cloudflare Access で、API は Access が付与する JWT（`Cf-Access-Jwt-Assertion`）を `jose` で検証し、`ACCESS_TEAM_DOMAIN`・`ACCESS_AUD` が未設定ならすべて 403 を返します。ローカルの `corepack pnpm dev` では検証を省き、D1 は Miniflare のローカル DB です。

## 出典と権利

- PokeAPI: https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv 、画像は https://github.com/PokeAPI/sprites
- 入手情報の詳細出典は各ルートの `source`
- Bank 終了告知: https://www.pokemon.co.jp/info/2022/02/220216_gm01.html?rss=260813

非公式のファンメイドツールです。Pokémon © Nintendo / Creatures / GAME FREAK。
