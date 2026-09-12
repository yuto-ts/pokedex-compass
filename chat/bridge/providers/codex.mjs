// `codex exec` adapter (§5.3, §10). Codex has no token-level delta: each
// completed `agent_message` arrives whole, so the dock shows the answer in
// paragraph-sized steps (V3).
import {
  ProviderError,
  jsonLines,
  launchError,
  stderrTail,
} from './process.mjs';

export const id = 'codex';
export const command = 'codex';

const READ_ONLY = 'sandbox_mode="read-only"';

export function buildArgs({ model, resume }) {
  // `codex exec resume` takes neither -C nor --sandbox, so the working
  // directory comes from spawn() and the sandbox from a config override.
  return resume
    ? [
        'exec',
        'resume',
        '--json',
        '-m',
        model,
        '--skip-git-repo-check',
        '--ignore-user-config',
        '-c',
        READ_ONLY,
        resume,
        '-',
      ]
    : [
        'exec',
        '--json',
        '-m',
        model,
        '--sandbox',
        'read-only',
        '--skip-git-repo-check',
        '--ignore-user-config',
        '-',
      ];
}

export async function* run({
  cwd,
  model,
  prompt,
  resume,
  signal,
  env = process.env,
}) {
  const state = {};
  let textSeen = false;
  // --add-dir is not passed on purpose: for Codex it grants *write* access,
  // and the read-only sandbox already lets the model read outside the cwd
  // (V10, §5.6).
  const events = jsonLines({
    command,
    args: buildArgs({ model, resume }),
    cwd,
    env,
    prompt,
    signal,
    state,
  });
  for await (const msg of events) {
    if (msg.type === 'thread.started' && msg.thread_id) {
      yield { type: 'meta', cliSessionId: msg.thread_id };
    } else if (
      msg.type === 'item.started' &&
      msg.item?.type !== 'agent_message'
    ) {
      if (msg.item?.type)
        yield { type: 'status', kind: 'tool', name: String(msg.item.type) };
    } else if (
      msg.type === 'item.completed' &&
      msg.item?.type === 'agent_message' &&
      msg.item.text
    ) {
      // Messages arrive whole; keep them apart as paragraphs.
      if (textSeen) yield { type: 'delta', text: '\n\n' };
      textSeen = true;
      yield { type: 'delta', text: String(msg.item.text) };
    } else if (msg.type === 'turn.completed') {
      const u = msg.usage ?? {};
      yield {
        type: 'usage',
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
      };
    } else if (msg.type === 'turn.failed' || msg.type === 'error') {
      const message = msg.error?.message ?? msg.message;
      if (message && !textSeen)
        throw new ProviderError(String(message), 'result');
    }
  }
  if (signal.aborted) return;
  if (state.spawnError) throw launchError(command, state.spawnError);
  // Partial text is kept and shown as the answer (§10).
  if (state.code !== 0 && !textSeen)
    throw new ProviderError(
      stderrTail(
        state.stderr ?? '',
        `codex が終了コード ${state.code} で終了しました`,
      ),
      'process',
    );
}
