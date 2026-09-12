// Job manager (§5.2, §5.5, §9): one CLI run per assistant message.
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SOURCES, formatLocal } from './contexts.mjs';
import { INTERRUPTED } from './threads.mjs';

export class HttpError extends Error {
  constructor(status, code, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const SKILLS = ['dex-compass-collection', 'dex-compass-guide'];
// The reference directory is built by scripts/build-chat-reference.mjs; the
// bridge still answers without it.
const OPTIONAL = new Set(['reference']);

// Link name inside the job cwd → absolute target (§5.5).
export function linkTargets({ root, workspace, contextId }) {
  const prompt = join(root, 'chat/prompts/system.md');
  const links = {
    'CLAUDE.md': prompt,
    'AGENTS.md': prompt,
    data: join(workspace, 'contexts', contextId),
    reference: join(workspace, 'reference'),
  };
  for (const skill of SKILLS) {
    const dir = join(root, 'chat/skills', skill);
    links[`.claude/skills/${skill}`] = dir;
    links[`.agents/skills/${skill}`] = dir;
  }
  return links;
}

export async function prepareCwd({ root, workspace, jobId, contextId }) {
  const cwd = join(workspace, 'jobs', jobId);
  const links = linkTargets({ root, workspace, contextId });
  const linked = [];
  for (const [name, target] of Object.entries(links)) {
    await mkdir(dirname(join(cwd, name)), { recursive: true });
    await symlink(target, join(cwd, name));
    // Every link must resolve; a missing target fails the job (§5.5).
    const resolved = await realpath(join(cwd, name)).catch(() => undefined);
    if (resolved) linked.push({ name, path: resolved });
    else if (OPTIONAL.has(name)) await rm(join(cwd, name), { force: true });
    else
      throw new Error(
        `ジョブの作業ディレクトリを準備できませんでした（${name}）`,
      );
  }
  return { cwd, linked };
}

export const CONTEXT_CHANGED =
  '収集状況は前回の質問から更新されています。収集状況に関する質問なら、答える前に data/collection.md を読み直してください。';

export function buildHeader({ page, context, contextChanged }) {
  const lines = [
    `現在の画面: ${page.label}`,
    `収集状況の版: ${context.contextId}（${SOURCES[context.source] ?? context.source}、${formatLocal(context.createdAt)} 時点）`,
  ];
  if (contextChanged) lines.push(CONTEXT_CHANGED);
  return lines.join('\n');
}

// Newest messages first until 20 messages or 12,000 characters (§9.1).
export function buildTranscript(
  messages,
  { maxMessages = 20, maxChars = 12000 } = {},
) {
  const picked = [];
  let chars = 0;
  for (const m of [...messages].reverse()) {
    if (!m.content) continue;
    const line = `[${m.role}] ${m.content}`;
    if (picked.length >= maxMessages || chars + line.length > maxChars) break;
    picked.unshift(line);
    chars += line.length;
  }
  return picked.length
    ? `これまでの会話（古い順）:\n${picked.join('\n')}\n---\n`
    : '';
}

const firstChars = (s, n) =>
  Array.from(s.replace(/\s+/g, ' ').trim()).slice(0, n).join('');

export function createJobManager({
  root,
  workspace,
  threads,
  contexts,
  providers,
  config,
  env = process.env,
  retentionMs = 10 * 60 * 1000,
  flushMs = 500,
  log = () => {},
}) {
  const jobs = new Map();
  let running = 0;
  const systemPromptPath = join(root, 'chat/prompts/system.md');

  const metaOf = (job) => ({
    provider: job.provider,
    model: job.model,
    contextId: job.contextId,
    ...(job.cliSessionId ? { cliSessionId: job.cliSessionId } : {}),
  });
  const doneOf = (job) => ({
    status: job.status,
    ...(job.error ? { error: job.error } : {}),
    ...(job.usage ? { usage: job.usage } : {}),
  });

  function broadcast(job, event, data) {
    for (const send of job.subscribers) send(event, data);
  }

  async function flush(job) {
    if (!job.dirty) return;
    job.dirty = false;
    await threads
      .update(job.threadId, (t) => {
        const m = t.messages.find((x) => x.id === job.messageId);
        if (!m || m.status !== 'streaming') return false;
        m.content = job.content;
      })
      .catch((e) => log(`job ${job.id} flush failed: ${e.message}`));
  }

  // Writes the final state to the thread file before announcing `done`, so a
  // finished answer can never turn into an `error` via a 404 (§5.2). The slot
  // is freed before `done` too, so the next question is never refused as busy.
  async function finish(job, status, error) {
    const finishedAt = new Date().toISOString();
    try {
      await threads
        .update(job.threadId, (t) => {
          const m = t.messages.find((x) => x.id === job.messageId);
          if (m) {
            m.content = job.content;
            m.status = status;
            if (error) m.error = error;
            if (job.usage) m.usage = job.usage;
            delete m.jobId;
          }
          if (job.cliSessionId) t.cliSessionId = job.cliSessionId;
          t.updatedAt = finishedAt;
        })
        .catch((e) => log(`job ${job.id} final write failed: ${e.message}`));
    } finally {
      job.status = status;
      if (error) job.error = error;
      job.finishedAt = finishedAt;
      running--;
    }
    broadcast(job, 'done', doneOf(job));
    for (const send of job.subscribers) send.end();
    job.subscribers.clear();
    const seconds = (Date.parse(finishedAt) - Date.parse(job.startedAt)) / 1000;
    log(`job ${job.id} ${status} ${seconds.toFixed(1)}s`);
    setTimeout(() => dispose(job), retentionMs).unref();
  }

  async function dispose(job) {
    jobs.delete(job.id);
    if (job.cwd) await rm(job.cwd, { recursive: true, force: true });
  }

  async function run(job, plan) {
    const adapter = providers[job.provider];
    const { signal } = job.controller;
    const timer = setTimeout(() => {
      job.timedOut = true;
      job.controller.abort();
    }, config.timeoutMs);
    const flusher = setInterval(() => flush(job), flushMs);
    const childEnv = { ...env };
    // A bridge started from inside a Claude Code session would otherwise
    // make the child think it is nested.
    delete childEnv.CLAUDECODE;
    let failure;
    try {
      const prepared = await prepareCwd({
        root,
        workspace,
        jobId: job.id,
        contextId: job.contextId,
      });
      job.cwd = prepared.cwd;
      // Reading through a link lands outside the cwd, so each target the
      // model may read needs --add-dir (§5.3).
      const addDirs = prepared.linked
        .filter((l) => l.name === 'data' || l.name === 'reference')
        .map((l) => l.path);
      let resume = plan.resume;
      for (;;) {
        try {
          const events = adapter.run({
            systemPromptPath,
            cwd: job.cwd,
            model: job.model,
            prompt: resume ? plan.resumePrompt : plan.freshPrompt,
            resume,
            addDirs,
            signal,
            env: childEnv,
          });
          for await (const ev of events) {
            if (ev.type === 'delta') {
              job.content += ev.text;
              job.dirty = true;
              broadcast(job, 'delta', { text: ev.text });
            } else if (ev.type === 'status') {
              broadcast(job, 'status', { kind: ev.kind, name: ev.name });
            } else if (ev.type === 'meta') {
              if (ev.cliSessionId && ev.cliSessionId !== job.cliSessionId) {
                job.cliSessionId = ev.cliSessionId;
                broadcast(job, 'meta', metaOf(job));
              }
            } else if (ev.type === 'usage') {
              job.usage = {
                inputTokens: ev.inputTokens,
                cacheReadTokens: ev.cacheReadTokens,
                cacheWriteTokens: ev.cacheWriteTokens,
                outputTokens: ev.outputTokens,
              };
            }
          }
          break;
        } catch (e) {
          // The CLI session is gone (expired, deleted): start over with the
          // transcript instead (§9.1).
          const sessionLost =
            e.kind === 'process' ||
            /no conversation found|session/i.test(String(e.message));
          if (resume && sessionLost && !job.content && !signal.aborted) {
            log(`job ${job.id} resume failed, falling back to transcript`);
            resume = undefined;
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      failure = e;
    }
    clearTimeout(timer);
    clearInterval(flusher);
    if (job.timedOut)
      await finish(
        job,
        'error',
        `タイムアウトしました（${config.timeoutMs / 1000} 秒）`,
      );
    else if (job.interrupted) await finish(job, 'error', INTERRUPTED);
    else if (signal.aborted) await finish(job, 'cancelled');
    else if (failure)
      await finish(job, 'error', String(failure.message || failure));
    else await finish(job, 'done');
  }

  return {
    get: (id) => jobs.get(id),

    busy: () => running >= config.maxConcurrentJobs,

    contextIds: () => new Set([...jobs.values()].map((j) => j.contextId)),

    async start({ threadId, content, contextId, page, provider, model }) {
      if (running >= config.maxConcurrentJobs)
        throw new HttpError(429, 'busy', '別の質問に回答中です');
      running++; // reserve the slot before the first await
      try {
        const context = await contexts.get(contextId);
        if (!context)
          throw new HttpError(
            409,
            'context_not_found',
            '収集状況の版が未登録です',
          );
        const now = new Date().toISOString();
        const job = {
          id: randomUUID(),
          threadId,
          messageId: randomUUID(),
          contextId,
          provider,
          model,
          status: 'streaming',
          content: '',
          startedAt: now,
          subscribers: new Set(),
          controller: new AbortController(),
          dirty: false,
        };
        const userMessageId = randomUUID();
        let plan;
        const thread = await threads.update(threadId, (t) => {
          const switched = t.provider !== provider || t.model !== model;
          const contextChanged =
            t.lastContextId !== undefined && t.lastContextId !== contextId;
          const fresh =
            switched ||
            !t.cliSessionId ||
            (config.freshSessionOnContextChange && contextChanged);
          const header = buildHeader({ page, context, contextChanged });
          const body = `${header}\n---\n${content}`;
          plan = {
            resume: fresh ? undefined : t.cliSessionId,
            resumePrompt: body,
            freshPrompt: buildTranscript(t.messages) + body,
          };
          if (!t.messages.some((m) => m.role === 'user'))
            t.title = firstChars(content, 30);
          if (switched) delete t.cliSessionId;
          t.provider = provider;
          t.model = model;
          t.lastContextId = contextId;
          t.updatedAt = now;
          t.messages.push(
            {
              id: userMessageId,
              role: 'user',
              content,
              status: 'done',
              contextId,
              page,
              createdAt: now,
            },
            {
              id: job.messageId,
              role: 'assistant',
              content: '',
              status: 'streaming',
              jobId: job.id,
              provider,
              model,
              createdAt: now,
            },
          );
        });
        if (!thread)
          throw new HttpError(404, 'thread_not_found', 'スレッドがありません');
        jobs.set(job.id, job);
        log(`job ${job.id} started (${provider} ${model})`);
        void run(job, plan);
        return { jobId: job.id, messageId: job.messageId, userMessageId };
      } catch (e) {
        running--;
        throw e;
      }
    },

    // SSE: `snapshot` first, then `meta`; `done` right away if already over.
    subscribe(id, send) {
      const job = jobs.get(id);
      if (!job) return undefined;
      send('snapshot', {
        messageId: job.messageId,
        status: job.status,
        content: job.content,
      });
      send('meta', metaOf(job));
      if (job.status !== 'streaming') {
        send('done', doneOf(job));
        send.end();
        return () => {};
      }
      job.subscribers.add(send);
      return () => job.subscribers.delete(send);
    },

    cancel(id) {
      const job = jobs.get(id);
      if (job?.status === 'streaming') job.controller.abort();
      return job;
    },

    cancelThread(threadId) {
      for (const job of jobs.values())
        if (job.threadId === threadId && job.status === 'streaming')
          job.controller.abort();
    },

    // Job directories of a previous bridge process are never reused.
    async cleanStale() {
      const dir = join(workspace, 'jobs');
      for (const name of await readdir(dir).catch(() => []))
        if (!jobs.has(name))
          await rm(join(dir, name), { recursive: true, force: true });
    },

    // Stopping the bridge is not a user cancel: record it like a crash (§5.2).
    async shutdown() {
      for (const job of jobs.values()) {
        if (job.status !== 'streaming') continue;
        job.interrupted = true;
        job.controller.abort();
      }
      while (running > 0) await new Promise((r) => setTimeout(r, 20));
      await Promise.all([...jobs.values()].map(dispose));
    },
  };
}
