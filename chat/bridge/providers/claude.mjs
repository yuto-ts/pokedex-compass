// `claude -p` adapter (§5.3, §10). Arguments go to spawn() as an array; no shell.
import {
  ProviderError,
  jsonLines,
  launchError,
  stderrTail,
} from './process.mjs';

export const id = 'claude';
export const command = 'claude';

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
  const state = {};
  let result;
  let textSeen = false;
  let separate = false;
  const events = jsonLines({
    command,
    args: buildArgs({ systemPromptPath, model, addDirs, resume }),
    cwd,
    env,
    prompt,
    signal,
    state,
  });
  for await (const msg of events) {
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
      if (msg.session_id) yield { type: 'meta', cliSessionId: msg.session_id };
      const u = msg.usage ?? {};
      // The three input figures are disjoint here: `input_tokens` counts only
      // what was processed anew this turn (§7).
      yield {
        type: 'usage',
        inputTokens: u.input_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
      };
    }
  }
  if (signal.aborted) return;
  if (state.spawnError) throw launchError(command, state.spawnError);
  const failed = result?.is_error || state.code !== 0;
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
      stderrTail(
        state.stderr ?? '',
        `claude が終了コード ${state.code} で終了しました`,
      ),
      'process',
    );
  }
}
