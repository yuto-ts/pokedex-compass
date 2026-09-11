# DEX COMPASS

全国図鑑1,025種を対象にした、Pokémon HOME収集支援ツール。

## 開発

パッケージマネージャーは **pnpm 12.3.4**。`corepack pnpm install`、`corepack pnpm dev`で起動。
`corepack pnpm test`、`corepack pnpm exec tsc --noEmit`、`corepack pnpm lint`、`corepack pnpm build`、`corepack pnpm build:html`で検証。`test`は図鑑エンジンの確認に加えて、チャットブリッジのテスト（`chat/bridge/*.test.mjs`、偽CLI `scripts/fake-claude.mjs`を使用）を実行します。

React / TypeScript / Tailwind CSS / shadcn/ui。Sites標準のVinextを利用し、Next.js App Router互換APIで実装しています。Next.jsそのものの実行環境ではありません。

## 単一HTML版

`corepack pnpm build:html`で`dist-html/index.html`を生成します。画面・CSS・JavaScript・図鑑データを1ファイルに内蔵し、サーバーなしでブラウザから直接開けます。

- `standalone/main.tsx`がエントリー。ページ移動はURLの`#/routes`・`#/pokemon/25`のようなハッシュで処理します。
- `next/link`・`next/image`は`standalone/`のシムに、`@/lib/href`は`standalone/href.ts`に差し替えてビルドします（`scripts/build-html.mjs`）。
- 保存先は開いたブラウザのlocalStorageで、公開サイトとは別です。チェック状態は自動移行されません。
- `file://`での保存挙動はブラウザに依存します。HTMLの移動・別ブラウザでの利用・閲覧データ削除で以前の記録が見えなくなる場合があります。
- ポケモン画像はPokeAPIの画像リポジトリから取得するため、表示にはインターネット接続が必要です。

## 機能

- 全1,025種の全国図鑑・日本語／ひらがな／英語／図鑑番号検索
- タイプ・世代・分類・収集状況・入手条件・難易度フィルター
- 捕獲・HOME送信・登録・Living Dex・フォルムの独立した永続管理
- 本編とバージョン別DLC設定、固定シンボル優先設定
- 根拠付きの作品別入手ルートとおすすめ比較
- 不足数、世代・分類別の残り、作品ごとの攻略チェックリスト
- Bank対策、個体ごとの大切な旧作個体フラグ
- 詳細URL、カード／表表示、スマートフォン対応

## データの範囲と限界

基本情報・フォルム・進化条件：PokeAPI公開CSV。`data/pokemon.json`、`data/evolution.json`。
旧作の通常草むら出現：PokeAPIのencounters。個別の時間帯等は出典を参照。
Switch作品の入手場所：Serebii各種ページのLocations表。`data/modern-routes.json`。自動取得は固定出現を推測せず、取得条件の原文とリンクを保持します。地名・条件の一部は英語です。
手動で確認したルート：`lib/dex.ts`。出典とDLC・通信・移送条件を明記。
確認日：2026-09-08。取得失敗や未対応ページは`data/import-report.json`に記録。

**全作品の全入手方法の検証済みデータベースではありません。** 未収録のものを入手不可とは扱わない設計です。フォルム一覧も、HOMEに保管できる全バリエーションを網羅しているとは限りません。
進化CSVの条件は作品・フォルム単位で差があり、特殊な判定を網羅できない場合は出典確認が必要です。
幻の自動取得ルートは追加条件を手動照合し、おすすめから除外できる`needsReview`を用意します。
★評価は目安です。最短攻略は収録済みルートの優先順位比較と作品別グルーピングであり、現在のストーリー進行・確率・実測時間を含む厳密最適化ではありません。
過去配布は現在開催中のイベントとしておすすめしません。GOのイベント開催は都度公式発表を確認。
準伝説は便宜的分類です。

## 保存と移行

状態モデル（State/Progress）と検証は`lib/state.ts`、保存のI/Oは`lib/storage.ts`が担当します。schema version 1。

- サイト版：`/api/state`（`app/api/state/route.ts`）経由でCloudflare D1の`state`テーブルに1行で保存します。テーブルは初回アクセス時に作成します。
- 保存のたびにrevisionを照合し、他の端末で先に更新されていれば409を返して上書きしません。画面には再読み込みを促すメッセージを出します。
- 単一HTML版：`standalone/storage.ts`がlocalStorage（キー`dex-compass-v1`）に保存します。

破損データは上書きせずエラーを表示。保存不能を成功として扱いません。

## ポケモン相談チャット（右サイドバー）

全ページの右端にチャット欄があり、この Mac で動く `claude` CLI（Claude のサブスクリプション）に質問できます。API キーは使いません。設計は`docs/chat-sidebar.md`。

起動手順:

1. `claude` にログイン済みであることを確認する（`claude -p "hi"` が応答すれば可）。
2. リポジトリで `corepack pnpm chat` を実行する。ブリッジが `http://127.0.0.1:47117` で待ち受け、接続トークンを表示します（`chat/workspace/.token` にも保存）。
3. サイト右端の「チャット」を開き、接続トークンを1回だけ入力する。トークンはそのブラウザのlocalStorageに保存されます。
4. https のサイト版では、最初の接続時にChromeの「ローカル ネットワークへのアクセス」ダイアログが出るので「許可」を押す。

- システムプロンプトは`chat/prompts/system.md`、収集状況skillは`chat/skills/dex-compass-collection/SKILL.md`。編集は次の質問から反映され、再起動は不要です。
- ポート・許可Origin・モデル一覧は`chat/config.json`。サイト版のドメインは`allowedOrigins`に追加してください。単一HTML版（`file://`）から使う場合は`allowNullOrigin`を`true`にします。
- 収集状況はブラウザがブリッジへ送った版（`chat/workspace/contexts/`）をAIがskillで読みます。チェック直後の質問は、送信前に最新の状態を同期してから送ります。

制約:

- ブリッジはローカル限定です。Cloudflare上のサイト版でも、チャットはブラウザと同じMacのブリッジに接続します。
- 履歴は`chat/workspace/history/`（Macごと）に保存され、別のMacとは共有されません。`chat/workspace/`はgit管理外です。
- 対応ブラウザはChromeです。Safariは確認していません。
- ChatGPT（Codex CLI）はフェーズ2で対応予定のため、選択肢には出ますが選べません。
- 同時に回答を生成できるのは1件です。1回の回答は180秒で打ち切ります。
- 質問ごとに`claude -p`を新しい作業ディレクトリで起動するため、`~/.claude/projects/`にジョブごとのセッションディレクトリが増えます。

手動確認チェックリスト（`ChatDock`は自動テストがありません）:

- [ ] 開閉・幅のドラッグ（320〜640px）が、ページを移動しても保たれる
- [ ] 生成中に左ナビで別ページへ移動しても、本文が欠けず二重にもならずに続きから表示される
- [ ] 入力途中の文がページ移動後も残る
- [ ] 捕獲チェックを付けた直後の質問に、新しい収集状況で答える
- [ ] サイト版と単一HTML版を同時に開いても、互いの収集状況を上書きしない（保存元が別の版になる）
- [ ] 履歴から再開・削除（確認ダイアログあり）ができる
- [ ] ブリッジ停止中は起動コマンドとトークン入力の案内が出る。生成中にブリッジが止まった回答は「ブリッジが停止したため中断しました」になる
- [ ] 640px以下では下からのシートで開く

## Cloudflareへのデプロイ

`corepack pnpm run deploy`でビルドし、Worker `pokedex-compass`としてデプロイします。D1の接続先：`vite.config.ts`の`d1_databases`。

アクセス制限：Cloudflare Access。APIはAccessが付与するJWT（`Cf-Access-Jwt-Assertion`）を`jose`で検証します。`vite.config.ts`の`ACCESS_TEAM_DOMAIN`・`ACCESS_AUD`が未設定なら、APIはすべて403。
ローカルの`corepack pnpm dev`では検証を省略し、D1はMiniflareのローカルDBを使用。

## 出典と権利

- https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv
- https://github.com/PokeAPI/sprites
- 入手情報の詳細出典は各ルートのsource
- Bank終了告知：https://www.pokemon.co.jp/info/2022/02/220216_gm01.html?rss=260813

非公式ファンメイドツール。Pokémon © Nintendo / Creatures / GAME FREAK。
