# 運用ガイド

起動・ビルド・デプロイの手順と、保存やチャットの設定をまとめます。何をなぜそう作ったかは [chat-sidebar.md](chat-sidebar.md)（チャット欄の設計書）と [data.md](data.md)（データの出典と限界）にあります。

## ローカルで動かす

Node 24 と pnpm 12.3.4 を使います。[mise](https://mise.jdx.dev) が入っていれば、`mise.toml` の定義に従って両方を自動で入れ、依存の取得（`package.json` か `pnpm-lock.yaml` が変わったときだけ再実行）まで済ませてから開発サーバーを起動します。初回は設定ファイルを信頼するか聞かれるので `y` と答えます。

```bash
mise run dev
```

mise を使わない場合は corepack 経由で同じことをします。

```bash
corepack pnpm install
```

```bash
corepack pnpm dev
```

ローカルでは Cloudflare Access の検証を省き、D1 は Miniflare のローカル DB です。

変更後の検証は次の 5 つをすべて通します。`test` は図鑑エンジンの確認（`scripts/check-engine.mjs`）と、偽 CLI（`scripts/fake-claude.mjs`、`scripts/fake-codex.mjs`）を使ったチャットブリッジのテスト（`chat/bridge/*.test.mjs`）です。

```bash
mise run check
```

個別に走らせるタスクは `mise tasks` に一覧があり、`mise run test` のように呼びます（`typecheck`、`lint`、`format`、`build`、`build:html`、`chat`、`deploy`）。mise なしなら次と同じです。

```bash
corepack pnpm test && corepack pnpm exec tsc --noEmit && corepack pnpm lint && corepack pnpm build && corepack pnpm build:html
```

## 単一 HTML 版

`mise run build:html`（または `corepack pnpm build:html`）が `dist-html/index.html` を生成します。画面・CSS・JavaScript・図鑑データを 1 ファイルに内蔵し、サーバーなしで開けます。エントリーは `standalone/main.tsx` で、ページ移動は `#/routes` や `#/pokemon/25` のようなハッシュです。`next/link`・`next/image` は `standalone/` のシム、`@/lib/href` は `standalone/href.ts` に差し替えてビルドします（`scripts/build-html.mjs`）。

記録は開いたブラウザの localStorage（キー `dex-compass-v1`）に入り、サイト版とは別で自動移行もされません。`file://` での保存はブラウザ依存で、HTML の移動・別ブラウザでの利用・閲覧データの削除で以前の記録が見えなくなることがあります。ポケモン画像は PokeAPI から取得するので、表示にはインターネット接続が要ります。

## サイト版を Cloudflare にデプロイする

`mise run deploy`（または `corepack pnpm run deploy`）でビルドし、Worker `pokedex-compass` としてデプロイします。D1 の接続先は `vite.config.ts` の `d1_databases` です。アクセス制限は Cloudflare Access で、API は Access が付与する JWT（`Cf-Access-Jwt-Assertion`）を `jose` で検証し、`ACCESS_TEAM_DOMAIN`・`ACCESS_AUD` が未設定ならすべて 403 を返します。

## 保存の仕組み

状態モデルと検証は `lib/state.ts`、保存の I/O は `lib/storage.ts` が担当します（schema version 1）。サイト版の保存先は `/api/state`（`app/api/state/route.ts`）経由の Cloudflare D1 で、`state` テーブル 1 行に書き、テーブルは初回アクセス時に作られます。保存のたびに revision を照合するので、他の端末が先に更新していれば 409 で上書きを止め、画面は再読み込みを促す表示に変わります。単一 HTML 版の保存先は `standalone/storage.ts` が扱う localStorage で、破損データは上書きせずエラー表示です。

## ポケモン相談チャット

右端のチャット欄から、この Mac で動く `claude` CLI（Claude のサブスクリプション）か `codex` CLI（ChatGPT のサブスクリプション）に質問できます。API キーは使いません。

1. 使う CLI にログインしておきます（`claude -p "hi"` が返れば可。ChatGPT 側なら `codex` も）。
2. `mise run chat`（または `corepack pnpm chat`）を実行します。ブリッジが `http://127.0.0.1:47117` で待ち受け、接続トークンを表示します（`chat/workspace/.token` にも保存）。
3. サイト右端の「チャット」を開き、トークンを 1 回入力します。トークンはそのブラウザの localStorage に残ります。
4. https のサイト版では、初回接続時に Chrome の「ローカル ネットワークへのアクセス」ダイアログが出るので「許可」を押します。

### 主なファイル

- `chat/prompts/system.md`: システムプロンプト。読み手の前提（シリーズの基本は知っている）と回答の書き方
- `chat/skills/`: skill。ユーザーの記録の調べ方（`dex-compass-collection`）とサイトのデータの調べ方（`dex-compass-guide`）
- `chat/config.json`: ポート・許可 Origin・モデル一覧。サイト版のドメインは `allowedOrigins` に足し、単一 HTML 版（`file://`）から使うときは `allowNullOrigin` を `true` にします
- `chat/workspace/`: git 管理外。ブラウザが送った収集状況・おすすめルート・Bank 対策（`contexts/`）、起動時に生成する作品別の入手方法・進化条件・サイト説明（`reference/`、約 4 MB）、履歴（`history/`）

プロンプトと skill の変更は次の質問から反映され、再起動は要りません。

### iPhone など同じ tailnet の端末から使う

待ち受けアドレスと許可 Origin を足してブリッジを起動し、開発サーバーも同じアドレスで待ち受けます。端末のブラウザで `http://<tailscale の IP>:3000/` を開いて同じトークンを入れれば使えます。MagicDNS の名前ではなく IP で開いてください（Vite のホスト検査）。

```bash
CHAT_BRIDGE_HOSTS=$(tailscale ip -4) CHAT_ALLOWED_ORIGINS=http://$(tailscale ip -4):3000 mise run chat
```

```bash
mise run dev -- -H $(tailscale ip -4)
```

恒久的に設定するなら `chat/config.json` の `extraBindHosts` と `allowedOrigins` に書けます。`0.0.0.0` では待ち受けず、守りはトークン・Origin 許可リスト・Host 検査の 3 つです。

### 制約

- ブリッジはこの Mac で動きます。Cloudflare 上のサイト版でも、ブラウザと同じ Mac（または tailnet 越しの同じ Mac）のブリッジにつなぎます。
- 履歴は `chat/workspace/history/` に Mac ごとに残り、別の Mac とは共有されません。
- 対応ブラウザは Chrome です。同時に生成できる回答は 1 件で、1 回の回答は 180 秒で打ち切ります。
- Codex は段落単位の表示になり、読み取り専用サンドボックスのため作業フォルダの外のファイルも読めます。
- 質問ごとに `claude -p` を新しい作業ディレクトリで起動するため、`~/.claude/projects/` にジョブごとのディレクトリが増えます。
