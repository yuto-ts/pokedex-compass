#!/usr/bin/env node
// Stand-in for `claude -p --output-format stream-json --include-partial-messages`
// used by the chat bridge tests (docs/chat-sidebar.md §14). It prints the same
// event shapes as claude 2.1.268 at a fixed interval.
//
// Environment:
//   FAKE_CLAUDE_REPLY        answer text (default: echoes the prompt length)
//   FAKE_CLAUDE_CHUNK        characters per text_delta (default 4)
//   FAKE_CLAUDE_INTERVAL_MS  delay between deltas (default 10)
//   FAKE_CLAUDE_READ         file (relative to cwd) read through a fake Skill → Read;
//                            its first 3 lines are prepended to the answer
//   FAKE_CLAUDE_FAIL_RESUME  when set, `--resume` exits 1 like a missing session
//   FAKE_CLAUDE_ERROR        emit an error result with this text and exit 1
//   FAKE_CLAUDE_LOG          append {args, cwd, stdin} as one JSON line
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const env = process.env;
const stdin = readFileSync(0, 'utf8');
if (env.FAKE_CLAUDE_LOG)
  appendFileSync(
    env.FAKE_CLAUDE_LOG,
    JSON.stringify({ args, cwd: process.cwd(), stdin }) + '\n',
  );

const resume = option('--resume');
if (resume && env.FAKE_CLAUDE_FAIL_RESUME) {
  process.stderr.write(`No conversation found with session ID: ${resume}\n`);
  process.exit(1);
}

const sessionId = resume ?? randomUUID();
const model = option('--model') ?? 'claude-haiku-4-5-20251001';
const interval = Number(env.FAKE_CLAUDE_INTERVAL_MS ?? 10);
const chunk = Number(env.FAKE_CLAUDE_CHUNK ?? 4);
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const event = (e) =>
  out({
    type: 'stream_event',
    event: e,
    session_id: sessionId,
    parent_tool_use_id: null,
    uuid: randomUUID(),
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

out({
  type: 'system',
  subtype: 'init',
  cwd: process.cwd(),
  session_id: sessionId,
  tools: (option('--tools') ?? '').split(',').filter(Boolean),
  mcp_servers: [],
  model,
  permissionMode: option('--permission-mode') ?? 'default',
  skills: ['dex-compass-collection'],
});
out({ type: 'noise' });
process.stdout.write('this line is not JSON\n');

if (env.FAKE_CLAUDE_ERROR) {
  out({
    type: 'result',
    subtype: 'success',
    is_error: true,
    result: env.FAKE_CLAUDE_ERROR,
    session_id: sessionId,
    usage: { input_tokens: 1, output_tokens: 0 },
  });
  process.exit(1);
}

let reply =
  env.FAKE_CLAUDE_REPLY ??
  `了解しました。${stdin.length} 文字を受け取りました。`;
if (env.FAKE_CLAUDE_READ) {
  // Skill → Read, as the real CLI does when the skill is used (V2).
  for (const name of ['Skill', 'Read']) {
    event({ type: 'message_start', message: { model, role: 'assistant' } });
    event({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: randomUUID(), name, input: {} },
    });
    event({ type: 'content_block_stop', index: 0 });
    event({ type: 'message_stop' });
    await sleep(interval);
  }
  const text = readFileSync(env.FAKE_CLAUDE_READ, 'utf8');
  reply = text.split('\n').slice(0, 3).join('\n') + '\n' + reply;
}

event({ type: 'message_start', message: { model, role: 'assistant' } });
event({
  type: 'content_block_start',
  index: 0,
  content_block: { type: 'text', text: '' },
});
for (let i = 0; i < reply.length; i += chunk) {
  await sleep(interval);
  event({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: reply.slice(i, i + chunk) },
  });
}
event({ type: 'content_block_stop', index: 0 });
event({
  type: 'message_delta',
  delta: { stop_reason: 'end_turn' },
  usage: { output_tokens: reply.length },
});
event({ type: 'message_stop' });
out({
  type: 'assistant',
  message: {
    model,
    role: 'assistant',
    content: [{ type: 'text', text: reply }],
  },
  session_id: sessionId,
  parent_tool_use_id: null,
});
out({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 1,
  num_turns: env.FAKE_CLAUDE_READ ? 3 : 1,
  result: reply,
  session_id: sessionId,
  usage: {
    // Disjoint figures, as the real CLI reports them: most of the prompt is
    // served from the cache and only a little is processed anew.
    input_tokens: 12,
    cache_read_input_tokens: stdin.length,
    cache_creation_input_tokens: 34,
    output_tokens: reply.length,
  },
});
