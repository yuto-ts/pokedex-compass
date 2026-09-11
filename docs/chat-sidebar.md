# ポケモン質問チャット（右サイドバー）設計

作成日: 2026-09-11
対象ブランチ: `claude/pokemon-chat-sidebar-e6b7ab`
状態: 設計案（未実装）
改訂: 2026-09-12 PR #1 の設計レビュー（4 件）を反映。§5.2・§5.5・§6.4・§7.3・§8・§9 を書き直し、§13 に V9〜V11 を追加
改訂 2: 2026-09-12 再レビュー（2 件）を反映。§5.5 のリンク先パス、§5.2・§7.3 の 404 時の扱いを修正
改訂 3: 2026-09-12 §13 のうち事前確認できる 8 件（V1〜V5・V7・V9・V10）を実機で検証し結果を反映。`--bare` を撤回、`--add-dir` と `--ignore-user-config` を追加

## 1. 要件

依頼内容を受け入れ条件の形に書き直したものです。

| # | 要件 | 受け入れ条件 |
|---|------|--------------|
| R1 | サイト上でいつでもポケモンのことを聞けるチャット（右サイドバー） | 全ページで右端にチャット欄を開閉できる |
| R2 | API ではなくローカルで起動した AI に指示を送る | API キーを持たない。ユーザーの Mac で動く `claude` / `codex` CLI（サブスクリプション認証）に問い合わせる |
| R3 | 質問する AI を選べる | Claude / ChatGPT（Codex CLI）を UI で切替できる |
| R4 | 返信が遅い agent 用途ではなく chat 向きの起動にする | ツール実行を最小にし、1 ターンで返す。詳細は §4 |
| R5 | モデルを選べる | AI ごとにモデル一覧から選べる。一覧は設定ファイルで管理する |
| R6 | 返答を途中でも表示する | トークン単位（不可なら段落単位）で逐次描画する |
| R7 | サイト内のタブ（全国図鑑／未所持／…）を移動しても右端に居座る | ページ遷移後も開閉状態・幅・表示中スレッド・入力途中の文・生成途中の返答が保たれる |
| R8 | 履歴機能 | スレッド一覧、再開、削除ができる。ブラウザを閉じても残る |
| R9 | 共通のシステムプロンプトを開始時に挿入する | 毎回同じ文面を先頭に入れる |
| R10 | システムプロンプトは git 管理し、いつでも変更できる | リポジトリ内の Markdown を編集すれば次の質問から反映される（再起動不要） |
| R11 | システムプロンプトから pokedex-compass の情報（捕獲・保管状況）にアクセスできる | AI が「何を捕まえたか」「HOME に送ったか」等に答えられる |
| R12 | R11 の情報は skill 等で保存し、常時コンテキストに入れない | ブリッジ側から毎ターン収集状況を注入しない。AI が skill で読んだ内容がその CLI セッションの文脈に残ることは許容する（§9.2） |

## 2. 現状の前提（確認済み）

- サイト版は Cloudflare Workers（vinext）で動き、Cloudflare Access の後ろにあります。収集状態は `/api/state` 経由で D1 に 1 行保存します（`app/api/state/route.ts`、`lib/storage.ts`）。
- 単一 HTML 版（`pnpm build:html`）は localStorage に保存し、ページ移動はハッシュで処理します（`standalone/main.tsx`）。
- 画面はすべて `components/dex-app.tsx`（1,393 行、`'use client'`）1 つで描画し、ページごとに `app/page.tsx` / `app/[view]/page.tsx` / `app/pokemon/[id]/page.tsx` から呼ばれます。
- 左ナビは `<a href>` によるフルページ遷移です（commit 7061ead で `next/link` から戻しています）。つまりタブ移動のたびに React ツリー全体が破棄されます。R7 はこの前提で満たす必要があります。
- 収集状態 `State` は `lib/state.ts` で定義され、`owned`（所持ソフト）、`dlc`、`fixed`、`progress[id]`（`caught / sent / registered / living / forms / preserve`）を持ちます。
- shadcn の chat 用プリミティブ（`components/ui/message.tsx`、`message-scroller.tsx`、`textarea.tsx`、`sheet.tsx`、`resizable.tsx`）が導入済みです。Markdown レンダラは入っていません。
- この Mac にあるもの: `claude` 2.1.268、`codex` 0.147.0、`ollama`（LLM モデルは未導入、埋め込みモデルのみ）、Node 24.13.0。
- `claude --help` で確認したフラグ: `--print`、`--output-format stream-json`、`--include-partial-messages`、`--system-prompt`（`--bare` の説明に `--system-prompt[-file]` の記載あり）、`--tools`（`""` で全ツール無効、`"Read,Skill"` のように列挙可）、`--setting-sources`、`--strict-mcp-config`、`--resume`、`--no-session-persistence`、`--model`、`--bare`。
- `codex exec --help` で確認したフラグ: `--json`（JSONL でイベント出力）、`-m`、`-C <dir>`、`--sandbox`、`--skip-git-repo-check`、`--ephemeral`、`--ignore-user-config`、`-o`、`codex exec resume <id>`。`~/.codex/config.toml` の既定モデルは `gpt-6-astra`、`~/.codex/models_cache.json` には `gpt-6-astra`、`gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`、`gpt-5.5` があります。

## 3. 全体構成

ブラウザから直接 CLI は起動できないので、ユーザーの Mac 上に小さな「ブリッジ」プロセスを置きます。サイト版・開発サーバー版・単一 HTML 版のどれで開いても、ブラウザは `http://127.0.0.1:<port>` のブリッジに話しかけます。

```
┌──────────────────────────────┐   fetch / SSE    ┌───────────────────────────┐
│ ブラウザ                       │ ───────────────▶ │ chat bridge (Node, ローカル) │
│  DexApp (既存)                │                  │  chat/bridge/server.mjs     │
│  ChatDock (新規, 右端に固定)    │ ◀─────────────── │  - スレッド保存 (JSON)       │
│  - スレッド/メッセージ表示      │   text delta     │  - 収集状況の版を保存         │
│  - 収集状態を PUT /contexts     │                  │  - CLI 起動・出力パース       │
└──────────────────────────────┘                  └────────────┬──────────────┘
                                                              spawn
                                    ┌─────────────────────────┴─────────────────────────┐
                                    │ claude -p … --output-format stream-json           │
                                    │ codex exec --json …                                │
                                    │   cwd = chat/workspace/jobs/<jobId>/ (§5.5)         │
                                    │     CLAUDE.md / AGENTS.md → chat/prompts/system.md │
                                    │     .claude/skills/… → chat/skills/…               │
                                    │     data/ → contexts/<contextId>/ (収集状況の版)    │
                                    └────────────────────────────────────────────────────┘
```

役割分担は次のとおりです。

- ブラウザ側 `ChatDock`: UI、ブリッジ接続、収集状態のアップロード、ページ遷移をまたぐ状態復元。
- ブリッジ: CLI の起動と出力の逐次転送、生成中本文の保持、履歴の永続化、収集状況スナップショットの保存とジョブへの固定。
- `chat/` ディレクトリ: git 管理する文面（システムプロンプト、SKILL.md、設定）と、生成物 `chat/workspace/`（gitignore）。

## 4. AI バックエンドの選定

### 4.1 候補の比較

| 候補 | 起動方法 | 認証 | 初回応答までの目安 | 逐次出力 | skill による遅延読込 | 備考 |
|------|----------|------|--------------------|----------|----------------------|------|
| Claude（`claude -p`） | `claude -p --output-format stream-json --include-partial-messages` | Claude サブスクリプション | 中央値 5.3 秒（haiku、ツール無効、10 回。V7） | トークン単位（実測済み） | `.claude/skills` を cwd に置く（実測済み。V2） | R2〜R6 をすべて満たす |
| ChatGPT（`codex exec`） | `codex exec --json -C <workspace>` | ChatGPT サブスクリプション | 未計測 | `--json` にトークン単位の delta は無い。`agent_message` 完了単位（V3） | cwd の `.agents/skills` または `.codex/skills`（実測済み。V4） | ChatGPT を CLI から使う手段は現状これ |
| ローカル LLM（Ollama） | `ollama` の HTTP（`/api/chat`） | 不要 | モデル次第 | あり | 仕組みがないためブリッジ側で疑似的に実装が必要 | ポケモン知識の精度が低い可能性。任意 |

### 4.2 「chat 向き」にするための方針

遅さの主因はエージェント的なツール呼び出しの往復なので、次のように起動を絞ります。

- Claude: `--tools "Read,Skill"` に限定する（ターン数上限のフラグは 2.1.268 の `--help` に無いため、打ち切りはブリッジ側のタイムアウトで行う）。ツールを使うのは skill（収集状況）を読むときだけになる。MCP は `--strict-mcp-config` で切る。設定は `--setting-sources project` で workspace のものだけ読む（ユーザー全体の `~/.claude/CLAUDE.md` や hooks を持ち込まない）。`--bare` は使わない（キーチェーンを読まないためサブスクリプション認証が通らず、skill も列挙されない。V2）。`--no-session-persistence` は付けず、`session_id` を控えて後続ターンの `--resume` に使えるようにする。
- Codex: `--sandbox read-only --skip-git-repo-check --ignore-user-config -C <job cwd>` で起動する。`--ignore-user-config` は `~/.codex/config.toml` の MCP サーバー（この Mac では `cua_repl`）を外すためで、認証は残る（V5・V10）。`--ephemeral` はスレッド継続（`codex exec resume`）ができなくなるため付けない。
- 既定モデルは軽いもの（Claude は `claude-haiku-4-5-20251001`、Codex は設定ファイルで指定）にし、必要なときだけ大きいモデルを選ぶ。
- 同時実行はブリッジ全体で 1 ジョブに制限する。多重起動でサブスクリプションの上限を使い切るのを防ぐ。

推奨: フェーズ 1 は Claude のみ実装し、Codex はアダプタ追加で対応します（§12）。Ollama は必要になったら追加します。

## 5. ブリッジの設計

### 5.1 配置と起動

```
chat/
  bridge/
    server.mjs           # HTTP サーバー本体（Node 標準モジュールのみ、依存追加なし）
    jobs.mjs             # ジョブ管理（1 並列、キャンセル、本文の蓄積と保存）
    threads.mjs          # 履歴の読み書き
    contexts.mjs         # 収集状況スナップショットの保存と参照
    providers/
      claude.mjs         # claude -p アダプタ
      codex.mjs          # codex exec アダプタ
  config.json            # ポート、許可 Origin、プロバイダとモデル一覧（git 管理）
  prompts/
    system.md            # 共通システムプロンプト（git 管理）
  skills/
    dex-compass-collection/SKILL.md   # 収集状況 skill（git 管理）
  workspace/             # 生成物。CLI の cwd はこの下の jobs/<jobId>/
    contexts/<contextId>/collection.md, state.json   # gitignore。収集状況スナップショット
    jobs/<jobId>/        # gitignore。ジョブごとの cwd（§5.5）
    history/             # gitignore。<threadId>.json
    .token               # gitignore。接続トークン
```

起動は `package.json` に `"chat": "node chat/bridge/server.mjs"` を追加し、`corepack pnpm chat` で行います。開発サーバー（`pnpm dev`）とは別プロセスです。本番（Cloudflare）にはこのプロセスは存在しないので、サイト版でもブラウザから直接 127.0.0.1 に接続します。

### 5.2 HTTP API

すべて `127.0.0.1` にのみ bind します。既定ポートは `47117`（`chat/config.json` で変更可）。

| メソッド | パス | 用途 |
|----------|------|------|
| GET | `/health` | 稼働確認。`{ version, providers: [{ id, available, models }] }` を返す。`available` は `which claude` 等の結果 |
| PUT | `/contexts` | 収集状況のスナップショットを登録する。本文は `{ source, collection, state }`。応答は `{ contextId }`。同じ内容なら同じ id を返す（§5.4） |
| GET | `/threads` | スレッド一覧（id, title, provider, model, updatedAt）。更新日時降順 |
| POST | `/threads` | 新規スレッド。`{ provider, model }` |
| GET | `/threads/:id` | メッセージ込みで返す。生成途中のメッセージは受信済み本文と `jobId` を含む |
| DELETE | `/threads/:id` | 削除 |
| POST | `/threads/:id/messages` | ユーザー発言を追加してジョブを開始。`{ content, contextId, page: { view, pokemonId?, label }, provider?, model? }`。`contextId` が未登録なら 409。`{ jobId, messageId }` を返す |
| GET | `/jobs/:id` | ジョブの現在値。`{ status, threadId, messageId, contextId, content }` |
| GET | `/jobs/:id/events` | SSE。接続直後に `snapshot`（それまでの本文全体）を送り、その後を逐次送る |
| POST | `/jobs/:id/cancel` | 生成中止。CLI プロセスにも SIGTERM を送る |

SSE のイベント種別は 5 つです。

- `snapshot`: `{ messageId, status, content }`。接続ごとに最初に 1 回。`content` は接続時点までの本文全体。
- `meta`: `{ provider, model, contextId, cliSessionId? }`。開始直後に 1 回。
- `delta`: `{ text }`。`snapshot` 以降の逐次テキスト。
- `status`: `{ kind: 'tool', name: 'Skill' | 'Read' }`。skill 参照中の表示に使う。
- `done`: `{ status: 'done' | 'cancelled' | 'error', error?, usage? }`。最後に 1 回。ジョブが既に終わっていれば `snapshot` の直後に送る。

再接続の契約は次のとおりです。ブリッジがジョブの本文全体を保持しているので、クライアントは受信位置を覚えなくてよい構成にします。

1. ブリッジは `delta` を受け取るたびにジョブの `content` に追記し、同じ文字列をスレッドファイル内の生成中メッセージにも 500 ms ごとと `done` 時に書き出す。
2. クライアントは `GET /jobs/:id/events` に接続し、`snapshot.content` で表示を置き換えてから `delta` を追記する。`Last-Event-ID` は使わない。
3. ジョブが無い場合（ブリッジ再起動、または完了から 10 分経過して破棄済み）は 404 を返す。404 はどちらの理由かを区別しないので、クライアントは `GET /threads/:id` を取り直し、スレッドファイルに保存された終了状態を優先する。保存済みの `status` が `done` / `cancelled` / `error` ならそのまま表示する。`streaming` のままで対応ジョブが無いときだけ、そのメッセージを `status: 'error'`（「ブリッジが停止したため中断」）として扱い、スレッドファイルにもその状態を書き戻す（`PATCH` は設けず、ブリッジ起動時に `streaming` のまま残っているメッセージを一括で `error` に直す）。

ブリッジは `done` 時にメッセージの最終 `status` と本文をスレッドファイルへ書き出してからジョブを破棄対象にします。この順序により、正常終了した回答が 404 を経由して `error` になることはありません。ジョブは完了後も 10 分間はメモリに保持し、ページ遷移直後の再接続に応えられるようにします。

### 5.3 プロバイダアダプタ

```ts
interface Provider {
  id: 'claude' | 'codex';
  models(): Promise<string[]>;                 // config.json と CLI 側の情報を合成
  run(input: {
    systemPromptPath: string;                  // chat/prompts/system.md
    cwd: string;                                // chat/workspace/jobs/<jobId>（§5.5）
    model: string;
    transcript: { role: 'user' | 'assistant'; content: string }[];  // 直近分
    prompt: string;                             // 今回の発言（画面コンテキスト付き）
    resume?: string;                            // 前ターンの CLI セッション id
    signal: AbortSignal;
  }): AsyncIterable<
    | { type: 'delta'; text: string }
    | { type: 'status'; kind: 'tool'; name: string }
    | { type: 'meta'; cliSessionId?: string }
    | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  >;
}
```

Claude アダプタの起動コマンド例です（引数はプロセス spawn で配列渡しにし、シェルは経由しません）。

```bash
claude -p \
  --output-format stream-json --include-partial-messages --verbose \
  --system-prompt-file chat/prompts/system.md \
  --model claude-haiku-4-5-20251001 \
  --tools "Read,Skill" \
  --setting-sources project --strict-mcp-config \
  --add-dir chat/workspace/contexts/<contextId> \
  --permission-mode default
```

- cwd はジョブごとの `chat/workspace/jobs/<jobId>`（§5.5）。プロンプトは stdin から渡します（argv 長の上限を避けるため）。
- `--add-dir` は必須です。cwd 内のシンボリックリンク `data/` の先は cwd 外と判定され、`--add-dir` なしでは Read が「許可されていない」で拒否されました（V2・V9）。
- `stream_event` の `content_block_delta` で `delta.type === 'text_delta'` のものを `delta` として流します。`content_block_start` で `tool_use` が来たら `status` を出します。最後の `result` イベントから `session_id` と `usage` を取ります。
- 2 ターン目以降は `--resume <session_id>` を優先し、失敗したら（セッションが消えている等）§9 の転写方式に切り替えます。

Codex アダプタの起動コマンド例です。

```bash
codex exec --json -m gpt-5.5 \
  -C chat/workspace/jobs/<jobId> --sandbox read-only --skip-git-repo-check \
  --ignore-user-config \
  -
```

- システムプロンプトはジョブ cwd の `AGENTS.md`（`prompts/system.md` へのリンク）として読ませます。Codex は cwd の `AGENTS.md` を自動で読みます。
- `--sandbox read-only` はモデルが生成したシェルコマンドを「書き込み不可・ネットワーク不可」で実行する方針であり、シェル実行そのものを止めるものではありません（レビュー指摘 4）。Codex については「読み取り用コマンドの実行は許容する」設計にします。詳細は §5.6。
- JSONL の `item.*` イベントのうち `item.type === 'agent_message'` の本文を流します。トークン単位の delta イベントはありません（V3 で確認。出るのは `thread.started` / `turn.started` / `item.started` / `item.completed` / `turn.completed`）。Codex はメッセージ完了単位の表示になり、R6 の「途中でも表示」は Codex では段落単位までです。skill を読む前に「読み直して確認します」という短い `agent_message` が先に来るので、それを表示すれば待ち時間の体感は減ります。
- stderr に `failed to load models cache: missing field supports_parallel_tool_calls` が毎回出ますが、応答には影響しませんでした（`~/.codex/models_cache.json` と 0.147.0 の不整合）。stderr はログに流さず捨てます。
- 1 ターンの入力トークンは 14,000〜39,000 でした（Codex 自身のシステムプロンプト分）。サブスクリプションの上限に響くので、既定モデルは軽いものにします。
- 2 ターン目以降は `codex exec resume <thread_id> -` を使います。

### 5.4 収集状況スナップショット（`PUT /contexts`）

レビュー指摘 1（サイト版と単一 HTML 版が同じファイルを上書きし合う、質問がデバウンス前に走る）への対応です。収集状況を「最新 1 つ」ではなく内容ごとのスナップショットとして保持し、質問はスナップショット id に紐づけます。

- `contextId` は `sha256(source + "\n" + collection + "\n" + JSON.stringify(state))` の先頭 16 桁です。同じ内容なら同じ id になるため、二重登録は起きません。
- `source` は `site` / `dev` / `standalone` のいずれかで、`collection.md` の先頭行にも書き出します。AI が「どの保存先の記録か」を答えられるようにするためです。
- 保存先は `chat/workspace/contexts/<contextId>/`。ブリッジは最新 30 件と、保持中のジョブまたはスレッドの最終ターンが参照している id を残し、それ以外を起動時と 1 時間ごとに削除します。
- 未登録の `contextId` でメッセージを送ると 409 を返します。クライアントは再同期してから送り直します。

### 5.5 ジョブごとの cwd

同時 1 ジョブでも、ジョブ実行中に別の版のスナップショットが登録されることはあります。ジョブが読むファイルを固定するため、ジョブごとに cwd を作ります。

```
chat/workspace/jobs/<jobId>/
  CLAUDE.md   → <repo>/chat/prompts/system.md
  AGENTS.md   → <repo>/chat/prompts/system.md
  .claude/skills/dex-compass-collection → <repo>/chat/skills/dex-compass-collection
  .agents/skills/dex-compass-collection → <repo>/chat/skills/dex-compass-collection
  data        → <repo>/chat/workspace/contexts/<contextId>
```

- リンク先はブリッジが `path.resolve(repoRoot, …)` で絶対パスとして計算します。相対パスで書くと階層を数え違えやすいためです（再レビュー指摘 1。相対で書くなら skill のリンクは `../../../../../skills/dex-compass-collection` で、5 階層上がります）。
- 作成後に `fs.realpath` で 5 つのリンク先が存在することを確認し、無ければジョブを `error` で終了します。テストでもこの解決結果を検証します（§14）。
- 中身はシンボリックリンクだけなので作成は数 ms です。ジョブの保持期間（10 分）が過ぎたら削除します。
- skill 本文は常に `data/collection.md` を読めばよく、どの版を読むかはブリッジが決めます。AI には版の選択をさせません。
- Codex は cwd の `.agents/skills` と `.codex/skills` のどちらからも skill を発見しました（V4）。ベンダー横断の `.agents/skills/dex-compass-collection` にもリンクを置きます（`.claude/skills` は Codex には見えません）。

### 5.6 セキュリティ

ブラウザ上のどのサイトからでも `127.0.0.1:47117` に POST できてしまうため、次を必須にします。

- **Origin の許可リスト**: `chat/config.json` の `allowedOrigins` に一致しない `Origin` は 403。既定はサイトのドメイン、`http://localhost:3000`、`http://127.0.0.1:3000`。単一 HTML 版（`file://`）は `Origin: null` になるため、`"null"` を許可するかどうかは設定で選べるようにし、既定では許可しません。
- **接続トークン**: 初回起動時に生成して `workspace/.token` に保存し、起動ログに表示します。ブラウザはドックの設定欄で 1 回入力し、localStorage に保存して `Authorization: Bearer` で送ります。`/health` 以外は必須です。
- **Local Network Access 対応**: Chrome 152 では、https のページから 127.0.0.1 へ最初に fetch した時点で「ローカルネットワークへのアクセス」の許可ダイアログが出て、fetch はユーザーが応答するまで保留になります（V6 で確認）。許可は Origin ごとに記憶され、拒否すると以後の fetch は即失敗します。ブリッジはプリフライトに `Access-Control-Allow-Private-Network: true` を返します（今回の検証では無くても通りましたが、古いバージョン向けに残します）。
- **Claude の権限**: `--tools "Read,Skill"` に限定し、書き込み・シェル実行のツールを与えません。cwd 外の Read は非対話モードでは拒否されます（`~/.zshrc` の Read が「許可されていない」で失敗。V9）。`--add-dir` で許可するのはそのジョブのスナップショットディレクトリ 1 つだけです。
- **Codex の権限**: `--sandbox read-only` で、モデルが生成したシェルコマンドを書き込み不可・ネットワーク不可で実行します。`touch /tmp/…` は `Operation not permitted`、`curl https://example.com` は名前解決失敗（exit 6）になることを確認しました（V10）。シェル実行自体は起こり、読み取りは cwd 外にも及ぶので、その旨をドックの AI 選択欄に注記します。シェルツールを外す設定（`-c features.shell_tool=false -c features.unified_exec=false`）は存在しますが、外すとモデルはユーザー設定の MCP（`cua_repl` の JavaScript 実行）に回り、サンドボックス外で Node の `fs` を使いました。そのためシェルは残し、代わりに `--ignore-user-config` で MCP を外します（V10）。残るツールは `web.run`（OpenAI 側の検索）と `apply_patch`（read-only で書けない）です。
- **ジョブ制限**: 同時 1 ジョブ、プロンプト上限 8,000 文字、タイムアウト 180 秒。超過時はプロセスを kill して `done` に `error` を載せます。
- **ログ**: プロンプト本文はログに残しません（stderr にはジョブ id と所要時間のみ）。

`https://` のサイトから `http://127.0.0.1` へ fetch できるかはブラウザ依存です。Chrome と Firefox はループバックを安全な文脈として扱うため通る想定ですが、Safari は未確認です（§13）。サイト側に CSP を追加する場合は `connect-src` に `http://127.0.0.1:47117` を加える必要があります。

## 6. システムプロンプトと skill

### 6.1 システムプロンプト（`chat/prompts/system.md`）

- git 管理し、ブリッジはリクエストごとにファイルを読み直します。編集は次の質問から効き、再起動は不要です（R10）。
- Claude には `--system-prompt-file` で渡します（既定のコーディング向けシステムプロンプトを置き換える）。Codex には `AGENTS.md` として読ませます。両方に同じファイルを使うため、文面は「どちらの CLI でも成り立つ」内容にします。
- 骨子は次のとおりです。
  - 役割: DEX COMPASS（Pokémon HOME 全国図鑑管理ツール）に付属するポケモン相談役。日本語で答える。
  - 知識の扱い: 入手方法・進化条件は作品ごとに差があること、知識の確認日を明示すること、断定できないときはそう書くこと。
  - 収集状況の参照ルール: 「捕まえた／未所持／HOME に送った／登録／Living Dex／大切な個体」に関する質問のときだけ `dex-compass-collection` skill を使う。それ以外では読まない（R12）。収集状況に答えるときは、同じスレッドで以前読んだ内容を使い回さず、毎回読み直してから答える。発言の先頭に付く「収集状況の版」が前回と違うときは特にそうする（§9.2）。
  - 出力形式: 短く、必要なら箇条書き。コードブロックは使わない。
  - 現在の画面: ユーザー発言の先頭に付く「現在の画面: …」行を文脈として使う。

### 6.2 収集状況 skill（`chat/skills/dex-compass-collection/SKILL.md`）

skill の frontmatter（`name`、`description`）だけが常時コンテキストに入り、本文とデータは呼び出されたときだけ読まれます。これで R11 と R12 を両立します。

```markdown
---
name: dex-compass-collection
description: ユーザーの全国図鑑の収集状況（捕獲・HOME送信・登録・Living Dex・フォルム・大切な個体・所持ソフト・DLC）を調べる。「捕まえた？」「持ってる？」「未所持は？」「HOMEに送った？」「あと何匹？」などの質問で使う。
---

# 収集状況の調べ方

1. `data/collection.md` を Read する。先頭に版（contextId）・保存元・生成時刻、集計（捕獲数・登録数・残り数・所持ソフト・DLC）、
   その下に 1,025 行の表（No. / 名前 / 世代 / 分類 / 捕獲 / 送信 / 登録 / Living / 大切 / フォルム）がある。
   この会話で以前に読んでいても、答える前に読み直す。
2. 特定のポケモンを聞かれたら表の該当行を答える。「未所持一覧」は捕獲列が空の行を数える。
3. 生データが必要なときだけ `data/state.json` を読む（`lib/state.ts` と同じ形）。
4. 表にないことは「DEX COMPASS には記録がない」と答える。推測で埋めない。
```

- `data/collection.md` と `data/state.json` はブラウザが `PUT /contexts` で送った内容からブリッジがスナップショットとして保存します（§5.4）。表の生成は `lib/dex.ts` の `pokemon` 一覧を持つブラウザ側で行い（`lib/chat/context.ts`）、ブリッジは受け取った文字列を書くだけにします。ブリッジで TypeScript のデータ加工を再実装しないためです。
- ジョブの cwd からは `data/` がそのジョブのスナップショットを指します（§5.5）。skill 本文はパスを固定して書けます。
- Codex 用にはジョブ cwd の `.agents/skills/` に同じ skill をリンクします（§5.5、V4）。

### 6.3 同期のタイミング（レビュー指摘 1）

ブラウザ側 `lib/chat/context.ts` は次の 2 つの値を持ちます。

- `synced`: 最後にブリッジが受理した `{ serialized: string, contextId: string }`
- `pending`: 現在の `State` を直列化した文字列（`DexApp` の保存 effect から更新）

同期は 2 系統です。

1. **背景同期**: `pending` が変わってから 2 秒後に `PUT /contexts`。通常の操作中はこれで追随します。
2. **送信直前の同期**: 送信ボタンを押した時点で `pending !== synced.serialized` なら、デバウンスを待たずに `PUT /contexts` を発行し、応答の `contextId` を受け取ってからメッセージを POST します。この間は入力欄を「収集状況を同期中…」にします。同期に失敗したら送信せず、エラーと再試行ボタンを出します。収集状況なしで送る選択肢は設けません（古い記録で答えるより、送れないほうが分かりやすいため）。

`State` の読込が終わる前（`loaded === false`）は送信ボタンを無効にします。単一 HTML 版とサイト版はそれぞれ別の `source` と `State` を持つので、別々の `contextId` になり、互いに上書きしません。



### 6.4 発言ヘッダー（画面コンテキストと収集状況の版）

「今見ているページ」と「どの版の収集状況か」は小さいので、システムプロンプトではなく各発言の先頭に付けます。ブリッジが `POST /threads/:id/messages` の内容から組み立てます。

```
現在の画面: ポケモン詳細 No.25 ピカチュウ
収集状況の版: 3f9a1c2b7d4e5f60（サイト版、2026-09-12 10:32 時点）
収集状況は前回の質問から更新されています。収集状況に関する質問なら必ず読み直してください。
---
ピカチュウの色違いはどこで出やすい？
```

3 行目は、このスレッドの直前のターンと `contextId` が異なるときだけ付けます（§9.2）。

`view`（dex / missing / legends / routes / bank / living / settings）と `pokemonId` をブラウザから送り、ブリッジが `data/pokemon.json` を読まずに済むよう名前もブラウザ側で付けて送ります。

## 7. フロントエンド設計

### 7.1 配置

- `components/chat/chat-dock.tsx`（`'use client'`）を `app/layout.tsx` の `<body>` 直下、`{children}` の後に置きます。`standalone/main.tsx` も同様に `<App />` の横に置きます。
- `DexApp` とは props でつながず、収集状態の共有は `lib/chat/context.ts` の `syncCollection(state, loaded)` を `DexApp` の保存 effect（`components/dex-app.tsx:213` 付近）から呼ぶ形にします（§6.3）。ページコンテキストは `DexApp` がマウント時に `setPageContext({ view, id })` を呼び、モジュールスコープの store に置きます。
- モジュール構成:
  - `components/chat/chat-dock.tsx`: 枠、開閉、幅、ヘッダー（AI・モデル選択、スレッド一覧ボタン、新規）
  - `components/chat/chat-thread.tsx`: メッセージ一覧。`components/ui/message.tsx` と `message-scroller.tsx` を使う
  - `components/chat/chat-composer.tsx`: 入力欄（`textarea.tsx`）、送信、停止
  - `components/chat/chat-threads.tsx`: 履歴一覧、削除
  - `components/chat/chat-setup.tsx`: 未接続時の案内（起動コマンド、トークン入力）
  - `lib/chat/client.ts`: ブリッジの fetch / SSE クライアント（再接続含む）
  - `lib/chat/store.ts`: `useSyncExternalStore` ベースの小さな store。localStorage との同期
  - `lib/chat/context.ts`: `collection.md` の生成、ページコンテキスト

### 7.2 レイアウト

- ドックは `position: fixed; right: 0; top: 0; height: 100dvh` の縦長パネルにし、開いている間は `body` に `padding-right: var(--chat-width)` を当てて本文と重ならないようにします。既存の `.shell` グリッド（`app/globals.css:182`）は触りません。
- 幅は 320〜640px の範囲でドラッグ変更できるようにします（ハンドルは pointer イベントで自前実装。`react-resizable-panels` は全面レイアウトの作り直しになるため使いません）。
- 閉じているときは右端に縦のタブ（アイコン＋「チャット」）だけ残します。
- 640px 以下（既存のモバイル分岐と同じ幅）では `components/ui/sheet.tsx` を使い、下からの全面シートに切り替えます。
- Markdown 表示には `marked` と `dompurify` を追加します（依存追加はこの 2 つ）。回答は箇条書きや強調を含む前提です。

### 7.3 ページ遷移をまたぐ復元（R7）

左ナビはフルページ遷移なので、次を localStorage（キー `dex-compass-chat-v1`）に持ち、マウント時に復元します。

- 開閉状態、幅
- 選択中の AI とモデル
- 表示中スレッド id
- 入力途中の文（入力のたびに保存）
- 生成中のジョブ id

生成途中の本文は localStorage に持ちません（レビュー指摘 2）。本文の正本はブリッジのジョブとスレッドファイルにあり、復元は次の順で行います。

1. マウント時に `GET /threads/:id` でスレッドを取得し、メッセージ一覧を描画する。生成中のメッセージは受信済み本文（ブリッジが 500 ms ごとに書き出したもの）と `jobId` を含む。
2. `jobId` があれば `GET /jobs/:id/events` に接続する。最初の `snapshot.content` でそのメッセージの本文を置き換え（1 で得た本文より新しい）、以降の `delta` を追記する。
3. 404 なら `GET /threads/:id` を取り直す。保存済みの `status` が `done` / `cancelled` / `error` ならそれを表示する（完了から 10 分以上経って戻ってきた場合がこれに当たる）。`streaming` のままで対応ジョブが無いときだけ `error`（「ブリッジが停止したため中断」）として表示する（§5.2 の契約と同じ）。

ブリッジ側のジョブはページ遷移で止まりません。遷移中に届いた分は `snapshot` に含まれるので、取りこぼしや二重表示は起きません。

`storage` イベントで他タブの変更も拾うので、同じサイトを複数のブラウザタブで開いても表示中スレッドが揃います。

### 7.4 未接続時の挙動

`/health` の応答を待つ間は「ブリッジに接続中…」を表示します。Chrome では最初の `/health` が許可ダイアログを出し、応答が保留になるため、1.5 秒経ったら「ブラウザの許可ダイアログで『許可』を押してください」に文言を変えます（fetch 自体は継続します）。fetch が失敗したら「ブリッジが起動していません」と表示し、次のコマンドと、トークン入力欄を出します。`navigator.permissions.query({ name: 'local-network-access' })` が使えるブラウザで状態が `denied` なら、サイト設定でリセットする案内に切り替えます。

```bash
corepack pnpm chat
```

接続できたが `providers[].available` が false の AI は選択肢を無効化し、「`claude` が見つかりません」のように理由を表示します。

## 8. データモデル

```ts
type Thread = {
  id: string;                 // UUID
  title: string;              // 最初の発言の先頭 30 文字。手動変更は対象外
  provider: 'claude' | 'codex';
  model: string;
  cliSessionId?: string;      // claude の session_id / codex の thread id
  lastContextId?: string;     // 直前のターンで使った収集状況の版（§9.2 の比較用）
  createdAt: string;          // ISO 8601
  updatedAt: string;
  messages: Message[];
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;            // assistant が streaming 中は受信済み本文
  status: 'done' | 'streaming' | 'cancelled' | 'error';
  error?: string;
  jobId?: string;             // streaming 中の assistant のみ
  contextId?: string;         // user のみ。この発言が参照する収集状況の版
  page?: { view: string; pokemonId?: number; label: string };  // user のみ
  provider?: string;          // assistant のみ。途中で切り替えた場合の記録
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  createdAt: string;
};

type Job = {                  // ブリッジのメモリ上。完了後 10 分で破棄
  id: string;
  threadId: string;
  messageId: string;
  contextId: string;
  status: 'streaming' | 'done' | 'cancelled' | 'error';
  content: string;            // 受信済み本文の全体
  startedAt: string;
};

type ContextSnapshot = {      // chat/workspace/contexts/<contextId>/meta.json
  contextId: string;
  source: 'site' | 'dev' | 'standalone';
  createdAt: string;
};
```

保存先は `chat/workspace/history/<threadId>.json`（1 スレッド 1 ファイル）です。D1 に置かない理由は、AI がローカルにしかいないため、履歴もローカルに置けば同じ Mac で開いたサイト版・開発版・単一 HTML 版のすべてから同じ履歴が見えるからです。別の Mac から見た履歴は共有されません。この制約は設定画面の注記に書きます。

## 9. マルチターンと履歴

### 9.1 セッション継続と転写

- 1 スレッド内では、まず CLI のセッション継続（Claude `--resume`、Codex `exec resume`）を使います。CLI 側が文脈を持つため、毎回の送信量が増えません。
- 継続に失敗したとき（セッションが期限切れ、AI やモデルをスレッド途中で切り替えたとき）は、直近 20 メッセージまたは 12,000 文字までの転写を次の形でプロンプト先頭に付けて送り、新しいセッション id を控え直します。

```
これまでの会話（古い順）:
[user] …
[assistant] …
---
現在の画面: …
収集状況の版: …
---
（今回の発言）
```

- AI とモデルはスレッド途中でも切り替えられます。切り替え後の最初の発言は転写方式になります。
- 履歴一覧は更新日時順です。削除は確認ダイアログ（`alert-dialog.tsx`）を挟みます。

### 9.2 継続セッションでの収集状況の扱い（レビュー指摘 3）

skill で読んだ `collection.md` の内容は、継続中の CLI セッションの文脈に残ります。ここで「捕獲状態を変えてから同じ質問をする」と、古い内容で答える可能性があります。次の 3 段で防ぎます。

1. **版を毎ターン渡す**: 発言ヘッダーに `収集状況の版: <contextId>` を必ず入れます（§6.4）。
2. **変更時は再読込を明示する**: ブリッジは `thread.lastContextId` と今回の `contextId` を比べ、異なれば「収集状況は前回の質問から更新されています。収集状況に関する質問なら必ず読み直してください」の行を付けます。ジョブ cwd の `data/` は新しいスナップショットを指しているので、読み直せば新しい内容になります。
3. **システムプロンプトでも毎回読み直しを指示する**: 収集状況の質問では以前読んだ内容を使い回さない、と書きます（§6.1）。2 は指示の強調であり、1 と 3 だけでも成り立つ設計にします。

skill 参照 1 回あたりの追加時間は約 6 秒でした（haiku、4 ターン、中央値 11.1 秒。V7）。それでも古い内容で答える余地は残ります（指示に従わない場合）。これを許容しない運用にしたい場合は、`contextId` が変わったターンでは `--resume` を使わず転写方式で新しいセッションを始める設定（`config.json` の `freshSessionOnContextChange: true`）を用意します。既定は `false` にし、V11 で古い回答の頻度を計ってから既定を決めます。

R12 の解釈は次のとおりです。ブリッジやシステムプロンプトから収集状況を毎ターン注入することはしません。AI が skill で読んだ結果がそのスレッドの CLI セッションに残ることは許容します。スレッドを新規作成すれば文脈は空になります。

## 10. ストリーミングの詳細

- Claude: `stream-json` の各行を JSON として読み、`type === 'stream_event'` かつ `event.type === 'content_block_delta'` かつ `event.delta.type === 'text_delta'` の `text` を `delta` に変換します。`event.type === 'content_block_start'` で `content_block.type === 'tool_use'` なら `status` を出します。`type === 'result'` で `session_id`、`usage`、`is_error` を取ります。行が JSON として壊れていたら捨てて続行し、プロセス終了コードが非 0 で本文が空なら `error` にします。
- Codex: `--json` の各行の `type` を見て、`item.completed` かつ `item.type === 'agent_message'` の `text` を流します。`thread.started` の `thread_id` を `cliSessionId` にします。`turn.completed` の `usage` を使います。トークン単位の delta イベントは無いので（V3）、`item.completed` ごとに 1 つの `delta` として流します。
- ブラウザ側は `delta` を受けるたびに末尾のメッセージに追記し、`message-scroller.tsx` の自動追従を使います。描画は `requestAnimationFrame` でまとめ、1 フレームに 1 回の setState にします。

## 11. 設定ファイル（`chat/config.json`）

```json
{
  "port": 47117,
  "allowedOrigins": [
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ],
  "allowNullOrigin": false,
  "maxConcurrentJobs": 1,
  "timeoutMs": 180000,
  "freshSessionOnContextChange": false,
  "contextRetention": 30,
  "providers": {
    "claude": {
      "label": "Claude",
      "default": "claude-haiku-4-5-20251001",
      "models": [
        "claude-haiku-4-5-20251001",
        "claude-sonnet-5",
        "claude-opus-5",
        "claude-fable-5-1"
      ]
    },
    "codex": {
      "label": "ChatGPT (Codex CLI)",
      "default": "gpt-5.5",
      "models": ["gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-6-astra"]
    }
  }
}
```

- サイト版のドメインはデプロイ先が確定してから `allowedOrigins` に追加します。
- Codex のモデル一覧は `~/.codex/models_cache.json` から取れることを確認済みです。`GET /health` ではこのファイルがあれば読み、設定の一覧と和集合にします。

## 12. 実装フェーズ

フェーズ 1（この設計の主要部分）

1. `chat/` ディレクトリ、`config.json`、`prompts/system.md`、`SKILL.md`、`.gitignore` 追記
2. ブリッジ本体（`/health`、`/contexts`、`/threads*`、`/jobs*`、Origin・トークン検査、1 並列制限、ジョブごとの cwd）
3. Claude アダプタ（stream-json パース、`--resume`、転写フォールバック）
4. `lib/chat/context.ts`（`collection.md` 生成、背景同期と送信直前同期、`contextId` の保持）
5. `ChatDock` 一式、`app/layout.tsx` と `standalone/main.tsx` への組み込み
6. 履歴 UI、ページ遷移後の `snapshot` による復元
7. README に起動手順と制約（ローカル限定、履歴は Mac ごと）を追記

フェーズ 2

1. Codex アダプタ（V3〜V5・V10 は検証済み。`agent_message` 完了単位の表示で実装する）
2. モバイル（Sheet）対応の調整
3. 使用トークン表示、キャンセル時の中途保存

フェーズ 3（必要になったら）

1. Ollama アダプタ（skill の代わりにブリッジ側で関数呼び出しを実装）
2. 履歴の書き出し（Markdown）

## 13. 未確定事項・要検証

検証日: 2026-09-12。環境は `claude` 2.1.268、`codex` 0.147.0、macOS、スクラッチ領域に §5.5 と同じ構成のジョブ cwd を作って実行。

| # | 項目 | 結果 | 設計への反映 |
|---|------|------|--------------|
| V1 | `claude --system-prompt-file` が使えるか | **確認済み**。ファイルの内容が役割として反映された | そのまま採用 |
| V2 | `--setting-sources project` で cwd の `.claude/skills` が読まれるか。`--bare` の影響 | **確認済み**。skill は `init` イベントの一覧に載り、`Skill` → `Read` の順で呼ばれた。ただし `data/` がシンボリックリンクだと Read が cwd 外扱いで拒否され、`--add-dir` を付けると読めた。`--bare` は「Not logged in」で失敗し、skill も列挙されない | `--add-dir <snapshot dir>` を必須にした（§5.3）。`--bare` は不採用（§4.2） |
| V3 | `codex exec --json` にトークン単位の delta があるか | **無し**。イベントは `thread.started` / `turn.started` / `item.started` / `item.completed` / `turn.completed` のみ | Codex は `agent_message` 完了単位の表示（§5.3、§10） |
| V4 | Codex の skill 探索パス | **確認済み**。cwd の `.agents/skills` と `.codex/skills` の両方で `dex-compass-collection` が一覧に出た | ジョブ cwd に `.agents/skills` リンクを追加（§5.5） |
| V5 | `--ignore-user-config` で認証が残るか | **残る**。`auth.json` は別扱いで応答が返った | Codex に常時付ける（§4.2） |
| V6 | `https://` ページから `http://127.0.0.1` への fetch（Safari、Chrome の許可ダイアログ） | **Chrome 152 は確認済み**。https://example.com から fetch すると Local Network Access の許可ダイアログが出て、fetch はユーザーが応答するまで保留になる。許可後は通常の fetch・プリフライト付き PUT・`EventSource`（`text/event-stream`）・`fetch` の `ReadableStream` がすべて通り、SSE の各チャンクは送信間隔（300 ms）どおり届いた。headless では自動拒否され `LocalNetworkAccessPermissionDenied` になる。mixed content ではない（`--disable-features=LocalNetworkAccessChecks` で通る）。**Safari は未確認**（AppleScript からの操作が許可待ちでタイムアウト） | §5.6 と §7.4 に許可ダイアログの扱いを追記。Safari は手動確認待ち |
| V7 | `claude -p` の応答時間 | haiku・ツール無効・10 回: 中央値 5.33 秒（4.86〜6.55）。skill 参照あり・5 回: 中央値 11.13 秒（10.5〜15.86）、毎回 4 ターン | §4.1 と §9.2 に記載 |
| V8 | Cloudflare Access 配下での fetch への干渉 | **未検証**。デプロイ後 | 実装時に確認 |
| V9 | cwd 外の Read が非対話モードで拒否されるか。リンク先の扱い | **拒否される**。`~/.zshrc` は「許可されていない」で失敗。`--add-dir` 指定のディレクトリ配下のリンク先は読めた | §5.6 に記載 |
| V10 | Codex のシェル無効化設定の有無。`read-only` の実効性 | `features.shell_tool` / `unified_exec` を false にできるが、モデルはユーザー設定の MCP（`cua_repl`）でサンドボックス外の JavaScript に回った。`--sandbox read-only` では `touch` が `Operation not permitted`、`curl` が exit 6 で、書き込みと外部通信は遮断された | シェルは残し、`--ignore-user-config` で MCP を外す（§5.6） |
| V11 | 継続セッションで収集状況を更新後、同じ質問に新しい内容を答えるか | **未検証**。発言ヘッダーと `--resume` の実装が必要 | 実装後に 10 回計測して `freshSessionOnContextChange` の既定を決める |
| V12 | ジョブごとに cwd を変えても `claude -p --resume` が前のセッションを引き継ぐか（§5.5 と §9.1 の両立） | **引き継ぐ**。`jobs/j1` で始めたセッションを `jobs/j2` から `--resume` し、前ターンの内容を答えた | §5.5 の per-job cwd をそのまま採用 |

未検証で残るのは V6・V8・V11 の 3 件です。V6 と V8 はブラウザとデプロイ環境が必要で、V11 は実装後に計測します。

## 16. 残るリスクと成立条件

設計変更後に残るリスクを、致命度の高い順に挙げます。

1. **V6 が通らないとサイト版でチャットが使えない（成立条件）**。ブラウザが `https://` ページから `http://127.0.0.1` への fetch を止めると、ブリッジ方式はサイト版で成り立ちません。Chrome 152 は許可ダイアログ経由で通ることを確認しました（V6）。Safari は未確認です。通らなかった場合の代替は、(a) ブリッジを `https://127.0.0.1` にして自己署名証明書を信頼させる、(b) サイト版ではチャットを無効にし `pnpm dev` と単一 HTML 版（`allowNullOrigin: true`）に限定する、の 2 つです。実装前に Chrome と Safari で `fetch('http://127.0.0.1:47117/health')` を試して決めます。
2. **Codex はサンドボックス内でディスク全体を読める**。`--sandbox read-only` は書き込みと外部通信を止めますが読み取りは止めず、`web.run`（OpenAI 側の検索）も残ります。プロンプトインジェクションの入口はユーザー自身の発言と `collection.md`（ポケモン名と ○ だけ）なので現実的な経路は狭いものの、ゼロではありません。Codex はフェーズ 2 に置き、AI 選択欄に注記します。
3. **ローカルの HTTP サーバーが他サイトから叩かれる**。Origin 許可リストとトークンで防ぎます。Origin ヘッダーはブラウザが付けるため偽装できず、トークンは許可した Origin の localStorage にしかありません。残るのはサイト自身の XSS 経由で、これは既存の `/api/state` と同じ前提です。
4. **サブスクリプションの消費**。Codex は 1 ターン 14,000〜39,000 入力トークン、Claude は skill 参照で 4 ターンです。同時 1 ジョブと軽いモデルの既定で抑えますが、上限に当たると「しばらく使えない」状態になります。ブリッジは CLI のレート制限エラーをそのままドックに表示します。

1 以外は設計の成立を左右しません。

## 14. テスト方針

- ブリッジ: `scripts/fake-claude.mjs`（stream-json を固定間隔で吐く偽 CLI）を `PATH` の先頭に置いた状態で、`/contexts` → `/threads` → `/messages` → `/jobs/:id/events` の流れ、途中接続時の `snapshot` に受信済み本文が全部入ること、未登録 `contextId` の 409、ジョブ cwd の 5 つのリンクが `realpath` で `chat/prompts/system.md`・`chat/skills/dex-compass-collection`・`chat/workspace/contexts/<contextId>` に解決すること、完了後 10 分経過でジョブが 404 になってもスレッドの `status` が `done` のまま残ること、起動時に `streaming` 残留メッセージが `error` に直されること、キャンセル、Origin 拒否、トークン不一致、タイムアウトを `node --test` で確認します。
- フロント: 既存の `pnpm test` は engine 確認のみなので、`ChatDock` は手動確認のチェックリストを README に置きます（開閉、幅、生成中にページ遷移して本文が欠けないこと、チェック直後の質問が新しい収集状況を反映すること、サイト版と単一 HTML 版を同時に開いても互いの記録を上書きしないこと、履歴削除、未接続表示、モバイル幅）。
- 型と lint: `corepack pnpm exec tsc --noEmit`、`corepack pnpm lint`、`corepack pnpm build`、`corepack pnpm build:html` を通します。

## 15. 追加・変更ファイル一覧

追加

- `chat/config.json`、`chat/prompts/system.md`
- `chat/skills/dex-compass-collection/SKILL.md`
- `chat/bridge/server.mjs`、`jobs.mjs`、`threads.mjs`、`contexts.mjs`、`providers/claude.mjs`、`providers/codex.mjs`
- `components/chat/chat-dock.tsx`、`chat-thread.tsx`、`chat-composer.tsx`、`chat-threads.tsx`、`chat-setup.tsx`
- `lib/chat/client.ts`、`store.ts`、`context.ts`
- `scripts/fake-claude.mjs`、`chat/bridge/*.test.mjs`
- `docs/chat-sidebar.md`（本書）

変更

- `app/layout.tsx`: `ChatDock` の配置
- `standalone/main.tsx`: 同上
- `components/dex-app.tsx`: `syncCollection` と `setPageContext` の呼び出し（各 1 行程度）
- `app/globals.css`: ドックのスタイル、`body` の右パディング
- `package.json`: `chat` スクリプト、`marked`、`dompurify` の追加
- `.gitignore`: `chat/workspace/`（生成物のみのため丸ごと）
- `README.md`: 起動手順と制約
