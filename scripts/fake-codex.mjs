#!/usr/bin/env node
// Stand-in for `codex exec --json` used by the chat bridge tests
// (docs/chat-sidebar.md §14). It prints the event shapes codex-cli 0.147.0
// produced in the check recorded as V14.
//
// Environment:
//   FAKE_CODEX_MESSAGES     agent messages separated by "|" (default: one line)
//   FAKE_CODEX_INTERVAL_MS  delay before each message (default 10)
//   FAKE_CODEX_TOOL         emit one command_execution item before the messages
//   FAKE_CODEX_FAIL_RESUME  when set, `exec resume` exits 1 like a lost session
//   FAKE_CODEX_ERROR        emit turn.failed with this text and exit 1
//   FAKE_CODEX_LOG          append {args, cwd, stdin} as one JSON line
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const env = process.env;
const stdin = readFileSync(0, 'utf8');
if (env.FAKE_CODEX_LOG)
  appendFileSync(
    env.FAKE_CODEX_LOG,
    JSON.stringify({ args, cwd: process.cwd(), stdin }) + '\n',
  );

// The real CLI prints this on every run; the bridge drops stderr.
process.stderr.write(
  'ERROR codex_models_manager::manager: failed to load models cache\n',
);

const resume = args[0] === 'exec' && args[1] === 'resume';
const threadId = resume ? args.at(-2) : randomUUID();
if (resume && env.FAKE_CODEX_FAIL_RESUME) {
  process.stderr.write(`No session found with id ${threadId}\n`);
  process.exit(1);
}

const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const interval = Number(env.FAKE_CODEX_INTERVAL_MS ?? 10);

out({ type: 'thread.started', thread_id: threadId });
out({ type: 'turn.started' });

if (env.FAKE_CODEX_ERROR) {
  out({ type: 'turn.failed', error: { message: env.FAKE_CODEX_ERROR } });
  process.exit(1);
}

if (env.FAKE_CODEX_TOOL) {
  out({
    type: 'item.started',
    item: { id: 'item_cmd', type: 'command_execution', command: 'ls' },
  });
  await sleep(interval);
  out({
    type: 'item.completed',
    item: { id: 'item_cmd', type: 'command_execution', exit_code: 0 },
  });
}

const messages = (
  env.FAKE_CODEX_MESSAGES ?? `受け取りました（${stdin.length} 文字）`
).split('|');
for (const [i, text] of messages.entries()) {
  await sleep(interval);
  out({
    type: 'item.started',
    item: { id: `item_${i}`, type: 'agent_message' },
  });
  out({
    type: 'item.completed',
    item: { id: `item_${i}`, type: 'agent_message', text },
  });
}

out({
  type: 'turn.completed',
  usage: {
    // `cached_input_tokens` is a part of `input_tokens`, as in V14.
    input_tokens: stdin.length + 100,
    cached_input_tokens: 100,
    cache_write_input_tokens: 0,
    output_tokens: messages.join('').length,
    reasoning_output_tokens: 0,
  },
});
