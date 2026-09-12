// Shared process handling for the CLI adapters (§5.3): spawn without a shell,
// feed the prompt on stdin, hand back the parsed JSONL, and kill the child
// when the job is cancelled or times out.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export class ProviderError extends Error {
  // kind 'process': the CLI exited without a result (e.g. unknown session id).
  // kind 'result': the CLI reported an error result (rate limit, bad model…).
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

// `state` receives { code, stderr, spawnError } once the child has exited.
export async function* jsonLines({
  command,
  args,
  cwd,
  env,
  prompt,
  signal,
  state,
}) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
  try {
    for await (const line of createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })) {
      try {
        yield JSON.parse(line);
      } catch {
        // A broken line is skipped, not fatal (§10).
      }
    }
    state.code = await exited;
    state.stderr = stderr;
    state.spawnError = spawnError;
  } finally {
    signal.removeEventListener('abort', kill);
    if (child.exitCode === null && child.signalCode === null) kill();
  }
}

export function launchError(command, spawnError) {
  return new ProviderError(
    spawnError.code === 'ENOENT'
      ? `\`${command}\` が見つかりません。PATH を確認してください`
      : `${command} を起動できませんでした: ${spawnError.message}`,
    'process',
  );
}

export const stderrTail = (stderr, fallback) =>
  stderr.trim().split('\n').slice(-3).join('\n') || fallback;
