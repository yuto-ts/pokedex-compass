# DEX COMPASS

全国図鑑1,025種を対象にした、Pokémon HOME収集支援ツール。

## 開発

パッケージマネージャーは **pnpm 12.3.4**。`corepack pnpm install`、`corepack pnpm dev`で起動。
`corepack pnpm test`、`corepack pnpm exec tsc --noEmit`、`corepack pnpm build`で検証。

React / TypeScript / Tailwind CSS / shadcn/ui。Sites標準のVinextを利用し、Next.js App Router互換APIで実装しています。Next.jsそのものの実行環境ではありません。

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

**全作品の全入手方法の検証済みデータベースではありません。** 未収録を入手不可と同一視しません。フォルム一覧もHOMEに保管できる全バリエーションを保証するものではありません。
進化CSVの条件は作品・フォルム単位で差があり、特殊な判定を網羅できない場合は出典確認が必要です。
幻の自動取得ルートは追加条件を手動照合し、おすすめから除外できる`needsReview`を用意します。
★評価は目安です。最短攻略は収録済みルートの優先順位比較と作品別グルーピングであり、現在のストーリー進行・確率・実測時間を含む厳密最適化ではありません。
過去配布は現在開催中のイベントとしておすすめしません。GOのイベント開催は都度公式発表を確認。
準伝説は便宜的分類です。

## 保存と移行

`lib/dex.ts`のstorageアダプターがlocalStorageへのI/Oを担当。キー`dex-compass-v1`、schema version 1。
状態モデル（State/Progress）とおすすめ・集計ロジックはUIから分離。Supabaseへ移行する場合はこのアダプターを非同期リポジトリーへ置き換えてください。
破損データは上書きせずエラーを表示。保存不能を成功として扱いません。アカウント同期や端末間同期は未実装。

## 出典と権利

- https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv
- https://github.com/PokeAPI/sprites
- 入手情報の詳細出典は各ルートのsource
- Bank終了告知：https://www.pokemon.co.jp/info/2022/02/220216_gm01.html?rss=260813

非公式ファンメイドツール。Pokémon © Nintendo / Creatures / GAME FREAK。
