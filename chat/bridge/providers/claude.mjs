// `claude -p` adapter (§5.3, §10). Arguments go to spawn() as an array; no shell.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export const id = 'claude';
export const command = 'claude';

export class ProviderError extends Error {
  // kind 'process': the CLI exited without a result (e.g. unknown --resume id).
  // kind 'result': the CLI reported an error result (rate limit, bad model…).
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

export function buildArgs({ systemPromptPath, model, addDirs = [], resume }) {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--system-prompt-file',
    systemPromptPath,
    '--model',
    model,
    '--tools',
    'Read,Skill',
    '--setting-sources',
    'project',
    '--strict-mcp-config',
    '--permission-mode',
    'default',
  ];
  for (const dir of addDirs) args.push('--add-dir', dir);
  if (resume) args.push('--resume', resume);
  return args;
}

export async function* run({
  systemPromptPath,
  cwd,
  model,
  prompt,
  resume,
  addDirs,
  signal,
  env = process.env,
}) {
  const child = spawn(
    command,
    buildArgs({ systemPromptPath, model, addDirs, resume }),
    { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stderr = '';
  let spawnError;
  child.stderr.on('data', (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  const exited = new Promise((resolve) => {
    child.on('error', (e) => {
      spawnError = e;
      resolve(null);
    });
    child.on('close', (code) => resolve(code));
  });
  const kill = () => {
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 3000).unref();
  };
  if (signal.aborted) kill();
  signal.addEventListener('abort', kill, { once: true });
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);

  let result;
  let textSeen = false;
  let separate = false;
  try {
    for await (const line of createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })) {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // a broken line is skipped, not fatal (§10)
      }
      if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
        yield { type: 'meta', cliSessionId: msg.session_id };
      } else if (msg.type === 'stream_event' && !msg.parent_tool_use_id) {
        const ev = msg.event ?? {};
        if (ev.type === 'content_block_start') {
          const block = ev.content_block ?? {};
          if (block.type === 'tool_use')
            yield { type: 'status', kind: 'tool', name: String(block.name) };
          // Text after a tool call or in a new block starts a new paragraph.
          if (textSeen) separate = true;
        } else if (
          ev.type === 'content_block_delta' &&
          ev.delta?.type === 'text_delta' &&
          ev.delta.text
        ) {
          if (separate) {
            separate = false;
            yield { type: 'delta', text: '\n\n' };
          }
          textSeen = true;
          yield { type: 'delta', text: ev.delta.text };
        }
      } else if (msg.type === 'result') {
        result = msg;
        if (msg.session_id)
          yield { type: 'meta', cliSessionId: msg.session_id };
        const u = msg.usage ?? {};
        yield {
          type: 'usage',
          inputTokens:
            (u.input_tokens ?? 0) +
            (u.cache_read_input_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0),
          outputTokens: u.output_tokens ?? 0,
        };
      }
    }
    const code = await exited;
    if (signal.aborted) return;
    if (spawnError)
      throw new ProviderError(
        spawnError.code === 'ENOENT'
          ? '`claude` が見つかりません。PATH を確認してください'
          : `claude を起動できませんでした: ${spawnError.message}`,
        'process',
      );
    const failed = result?.is_error || code !== 0;
    // Partial text is kept and shown as the answer (§10).
    if (failed && !textSeen) {
      if (result)
        throw new ProviderError(
          String(
            result.result || result.subtype || 'claude がエラーを返しました',
          ),
          'result',
        );
      throw new ProviderError(
        stderr.trim().split('\n').slice(-3).join('\n') ||
          `claude が終了コード ${code} で終了しました`,
        'process',
      );
    }
  } finally {
    signal.removeEventListener('abort', kill);
    if (child.exitCode === null && child.signalCode === null) kill();
  }
}
