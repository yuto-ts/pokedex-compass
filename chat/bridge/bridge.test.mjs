// Bridge tests with scripts/fake-claude.mjs first on PATH (docs/chat-sidebar.md §14).
import assert from 'node:assert/strict';
import { request } from 'node:http';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { contextIdOf } from './contexts.mjs';
import { CONTEXT_CHANGED, SKILLS, buildTranscript } from './jobs.mjs';
import { createBridge, hostAllowlist, resolveConfig } from './server.mjs';
import { INTERRUPTED } from './threads.mjs';

const root = resolve(import.meta.dirname, '../..');
const baseConfig = JSON.parse(
  await readFile(join(root, 'chat/config.json'), 'utf8'),
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = [];
after(async () => {
  for (const fn of cleanup.reverse()) await fn();
});

async function start({ env = {}, config = {}, retentionMs, seed } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dex-chat-test-'));
  const workspace = join(dir, 'workspace');
  const bin = join(dir, 'bin');
  await mkdir(bin);
  await writeFile(
    join(bin, 'claude'),
    `#!/bin/sh\nexec "${process.execPath}" "${join(root, 'scripts/fake-claude.mjs')}" "$@"\n`,
  );
  await chmod(join(bin, 'claude'), 0o755);
  if (seed) await seed(workspace);
  const log = join(dir, 'calls.jsonl');
  const bridge = await createBridge({
    root,
    workspace,
    config: { ...baseConfig, ...config },
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_CLAUDE_LOG: log,
      ...env,
    },
    retentionMs,
    flushMs: 50,
    log: () => {},
  });
  const port = await bridge.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const closed = { done: false };
  const close = async () => {
    if (closed.done) return;
    closed.done = true;
    await bridge.close();
    await rm(dir, { recursive: true, force: true });
  };
  cleanup.push(close);

  async function api(method, path, body, headers = {}) {
    const init = {
      method,
      headers: {
        authorization: `Bearer ${bridge.token}`,
        'content-type': 'application/json',
        ...headers,
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(base + path, init);
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      body: text ? JSON.parse(text) : undefined,
    };
  }

  // Reads the SSE stream until the server closes it.
  async function events(jobId) {
    const res = await fetch(`${base}/jobs/${jobId}/events`, {
      headers: { authorization: `Bearer ${bridge.token}` },
    });
    if (res.status !== 200) return { status: res.status, list: [] };
    const decoder = new TextDecoder();
    const list = [];
    let buf = '';
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (raw.startsWith(':')) continue;
        list.push({
          event: /^event: (.*)$/m.exec(raw)[1],
          data: JSON.parse(/^data: (.*)$/m.exec(raw)[1]),
        });
      }
    }
    return { status: 200, list };
  }

  async function calls() {
    const text = await readFile(log, 'utf8').catch(() => '');
    return text.trim().split('\n').filter(Boolean).map(JSON.parse);
  }

  return { bridge, api, events, calls, base, workspace, close };
}

const page = {
  view: 'pokemon',
  pokemonId: 25,
  label: 'ポケモン詳細 No.25 ピカチュウ',
};
const state = (caught = []) => ({
  version: 1,
  owned: ['Scarlet'],
  dlc: [],
  fixed: true,
  progress: Object.fromEntries(caught.map((id) => [id, { caught: true }])),
});
const snapshot = (caught = []) => ({
  source: 'dev',
  collection: `## 集計\n- 捕獲: ${caught.length} / 1025\n`,
  routes: '## おすすめ攻略ルート\n- No.0001 フシギダネ: 野生出現\n',
  bank: `## Bank 終了対策\n- 印: ${caught.length}匹\n`,
  state: state(caught),
});

async function setup(b, { caught = [] } = {}) {
  const ctx = await b.api('PUT', '/contexts', snapshot(caught));
  assert.equal(ctx.status, 200);
  const thread = await b.api('POST', '/threads', {
    provider: 'claude',
    model: 'claude-haiku-4-5-20251001',
  });
  assert.equal(thread.status, 201);
  return { contextId: ctx.body.contextId, threadId: thread.body.id };
}

async function ask(
  b,
  threadId,
  contextId,
  content = 'ピカチュウは捕まえた？',
  extra = {},
) {
  return b.api('POST', `/threads/${threadId}/messages`, {
    content,
    contextId,
    page,
    ...extra,
  });
}

async function waitDone(b, jobId) {
  for (let i = 0; i < 400; i++) {
    const job = await b.api('GET', `/jobs/${jobId}`);
    if (job.status !== 200 || job.body.status !== 'streaming') return job;
    await sleep(10);
  }
  throw new Error('job did not finish');
}

test('contexts → threads → messages → events delivers the whole answer', async () => {
  const reply = 'ピカチュウは捕獲済みです。HOME にも送信済みです。';
  const b = await start({ env: { FAKE_CLAUDE_REPLY: reply } });
  const health = await fetch(b.base + '/health').then((r) => r.json());
  assert.equal(health.version, 1);
  const claude = health.providers.find((p) => p.id === 'claude');
  assert.equal(claude.available, true);
  assert.ok(claude.models.includes('claude-haiku-4-5-20251001'));
  const codex = health.providers.find((p) => p.id === 'codex');
  assert.deepEqual([codex.available, codex.reason], [false, 'not_implemented']);

  const { contextId, threadId } = await setup(b);
  const started = await ask(b, threadId, contextId);
  assert.equal(started.status, 202);
  const { jobId, messageId } = started.body;
  const { list } = await b.events(jobId);
  assert.equal(list[0].event, 'snapshot');
  assert.equal(list[0].data.messageId, messageId);
  assert.equal(list[1].event, 'meta');
  assert.equal(list[1].data.contextId, contextId);
  const done = list.at(-1);
  assert.equal(done.event, 'done');
  assert.equal(done.data.status, 'done');
  assert.ok(done.data.usage.outputTokens > 0);
  const streamed =
    list[0].data.content +
    list
      .filter((e) => e.event === 'delta')
      .map((e) => e.data.text)
      .join('');
  assert.equal(streamed, reply);

  const thread = (await b.api('GET', `/threads/${threadId}`)).body;
  assert.equal(thread.title, 'ピカチュウは捕まえた？');
  assert.equal(thread.lastContextId, contextId);
  assert.ok(thread.cliSessionId);
  const [user, assistant] = thread.messages;
  assert.deepEqual(
    [user.role, user.contextId, user.page.label],
    ['user', contextId, page.label],
  );
  assert.deepEqual(
    [assistant.id, assistant.status, assistant.content, assistant.jobId],
    [messageId, 'done', reply, undefined],
  );
  const listing = (await b.api('GET', '/threads')).body.threads;
  assert.deepEqual(
    listing.map((t) => t.id),
    [threadId],
  );

  const [call] = await b.calls();
  assert.ok(
    call.stdin.startsWith(
      `現在の画面: ${page.label}\n収集状況の版: ${contextId}（開発サーバー版、`,
    ),
  );
  assert.ok(call.stdin.endsWith('\n---\nピカチュウは捕まえた？'));
  assert.ok(!call.stdin.includes(CONTEXT_CHANGED));
  for (const flag of [
    '-p',
    '--include-partial-messages',
    '--strict-mcp-config',
  ])
    assert.ok(call.args.includes(flag), flag);
  assert.equal(call.args[call.args.indexOf('--tools') + 1], 'Read,Skill');
  assert.equal(
    call.args[call.args.indexOf('--setting-sources') + 1],
    'project',
  );
  assert.equal(
    call.args[call.args.indexOf('--system-prompt-file') + 1],
    join(root, 'chat/prompts/system.md'),
  );
  assert.ok(!call.args.includes('--resume'));
});

test('a subscriber joining mid-stream gets everything received so far in snapshot', async () => {
  const reply = 'あいうえおかきくけこさしすせそたちつてとなにぬねの'.repeat(4);
  const b = await start({
    env: {
      FAKE_CLAUDE_REPLY: reply,
      FAKE_CLAUDE_CHUNK: '2',
      FAKE_CLAUDE_INTERVAL_MS: '15',
    },
  });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  while ((await b.api('GET', `/jobs/${jobId}`)).body.content.length < 10)
    await sleep(10);
  const { list } = await b.events(jobId);
  const snap = list[0].data;
  assert.equal(snap.status, 'streaming');
  assert.ok(snap.content.length > 0 && snap.content.length < reply.length);
  const rest = list
    .filter((e) => e.event === 'delta')
    .map((e) => e.data.text)
    .join('');
  assert.equal(snap.content + rest, reply);
  // The thread file holds the partial answer too (flushed every 50 ms here).
  const thread = (await b.api('GET', `/threads/${threadId}`)).body;
  assert.equal(thread.messages[1].content, reply);
});

test('unknown contextId is 409 and nothing is appended', async () => {
  const b = await start();
  const { threadId } = await setup(b);
  const res = await ask(b, threadId, '0123456789abcdef');
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'context_not_found');
  assert.equal(
    (await b.api('GET', `/threads/${threadId}`)).body.messages.length,
    0,
  );
});

test('job cwd links resolve to the prompts, skills, snapshot and reference', async () => {
  const b = await start({
    env: {
      FAKE_CLAUDE_READ: 'data/collection.md',
      FAKE_CLAUDE_INTERVAL_MS: '30',
    },
    seed: async (workspace) => {
      await mkdir(join(workspace, 'reference', 'species'), { recursive: true });
      await writeFile(
        join(workspace, 'reference', 'species', '0025.md'),
        '# No.0025 ピカチュウ\n',
      );
    },
  });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  await sleep(100);
  const cwd = join(b.workspace, 'jobs', jobId);
  const expected = {
    'CLAUDE.md': join(root, 'chat/prompts/system.md'),
    'AGENTS.md': join(root, 'chat/prompts/system.md'),
    data: join(b.workspace, 'contexts', contextId),
    reference: join(b.workspace, 'reference'),
  };
  for (const skill of SKILLS) {
    expected[`.claude/skills/${skill}`] = join(root, 'chat/skills', skill);
    expected[`.agents/skills/${skill}`] = join(root, 'chat/skills', skill);
  }
  for (const [name, target] of Object.entries(expected))
    assert.equal(await realpath(join(cwd, name)), await realpath(target), name);
  for (const skill of SKILLS)
    assert.ok(
      (
        await readFile(join(cwd, `.claude/skills/${skill}/SKILL.md`), 'utf8')
      ).includes(`name: ${skill}`),
      skill,
    );

  const { list } = await b.events(jobId);
  assert.deepEqual(
    list.filter((e) => e.event === 'status').map((e) => e.data.name),
    ['Skill', 'Read'],
  );
  const thread = (await b.api('GET', `/threads/${threadId}`)).body;
  // The fake read data/collection.md through the link: the header written by
  // the bridge carries this job's contextId.
  assert.ok(
    thread.messages[1].content.includes(`- 版（contextId）: ${contextId}`),
  );
  const [call] = await b.calls();
  assert.equal(await realpath(call.cwd), await realpath(cwd));
  const addDirs = call.args.filter((_, i) => call.args[i - 1] === '--add-dir');
  assert.deepEqual(addDirs, [
    await realpath(join(b.workspace, 'contexts', contextId)),
    await realpath(join(b.workspace, 'reference')),
  ]);
  assert.equal(
    await readFile(join(cwd, 'reference/species/0025.md'), 'utf8'),
    '# No.0025 ピカチュウ\n',
  );
});

test('a missing reference directory only drops that link', async () => {
  const b = await start({ env: { FAKE_CLAUDE_REPLY: '参照なしでも答えます' } });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  const job = await waitDone(b, jobId);
  assert.equal(job.body.status, 'done');
  const [call] = await b.calls();
  assert.deepEqual(
    call.args.filter((_, i) => call.args[i - 1] === '--add-dir'),
    [await realpath(join(b.workspace, 'contexts', contextId))],
  );
  await assert.rejects(
    readFile(join(b.workspace, 'jobs', jobId, 'reference/site.md'), 'utf8'),
  );
});

test('after retention the job is 404 but the thread keeps status done', async () => {
  const b = await start({
    retentionMs: 150,
    env: { FAKE_CLAUDE_REPLY: '完了' },
  });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  const job = await waitDone(b, jobId);
  assert.equal(job.body.status, 'done');
  // Still served right after completion: snapshot then done.
  const early = await b.events(jobId);
  assert.deepEqual(
    early.list.map((e) => e.event),
    ['snapshot', 'meta', 'done'],
  );
  assert.equal(early.list[0].data.content, '完了');
  await sleep(300);
  assert.equal((await b.api('GET', `/jobs/${jobId}`)).status, 404);
  assert.equal((await b.events(jobId)).status, 404);
  const thread = (await b.api('GET', `/threads/${threadId}`)).body;
  assert.equal(thread.messages[1].status, 'done');
  assert.equal(thread.messages[1].content, '完了');
  assert.deepEqual(await readdir(join(b.workspace, 'jobs')), []);
});

test('messages left streaming by a stopped bridge become error at startup', async () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const b = await start({
    seed: async (workspace) => {
      await mkdir(join(workspace, 'history'), { recursive: true });
      await mkdir(join(workspace, 'jobs', 'leftover'), { recursive: true });
      await writeFile(
        join(workspace, 'history', id + '.json'),
        JSON.stringify({
          id,
          title: 't',
          provider: 'claude',
          model: 'claude-haiku-4-5-20251001',
          createdAt: '2026-09-12T00:00:00.000Z',
          updatedAt: '2026-09-12T00:00:00.000Z',
          messages: [
            {
              id: 'u',
              role: 'user',
              content: 'q',
              status: 'done',
              createdAt: '2026-09-12T00:00:00.000Z',
            },
            {
              id: 'a',
              role: 'assistant',
              content: '途中',
              status: 'streaming',
              jobId: 'gone',
              createdAt: '2026-09-12T00:00:00.000Z',
            },
          ],
        }),
      );
    },
  });
  const thread = (await b.api('GET', `/threads/${id}`)).body;
  assert.deepEqual(
    [
      thread.messages[1].status,
      thread.messages[1].error,
      thread.messages[1].jobId,
      thread.messages[1].content,
    ],
    ['error', INTERRUPTED, undefined, '途中'],
  );
  assert.deepEqual(await readdir(join(b.workspace, 'jobs')), []);
});

test('stopping the bridge records a running answer as interrupted', async () => {
  const b = await start({
    env: {
      FAKE_CLAUDE_REPLY: 'う'.repeat(200),
      FAKE_CLAUDE_CHUNK: '1',
      FAKE_CLAUDE_INTERVAL_MS: '20',
    },
  });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  while (!(await b.api('GET', `/jobs/${jobId}`)).body.content) await sleep(10);
  await b.bridge.close();
  const thread = JSON.parse(
    await readFile(join(b.workspace, 'history', threadId + '.json'), 'utf8'),
  );
  const m = thread.messages[1];
  assert.deepEqual(
    [m.status, m.error, m.jobId],
    ['error', INTERRUPTED, undefined],
  );
  assert.ok(m.content.length > 0);
});

test('cancel stops the CLI and keeps the partial answer as cancelled', async () => {
  const b = await start({
    env: {
      FAKE_CLAUDE_REPLY: 'あ'.repeat(200),
      FAKE_CLAUDE_CHUNK: '1',
      FAKE_CLAUDE_INTERVAL_MS: '20',
    },
  });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  const stream = b.events(jobId);
  // The first exec of a freshly written script is slow on macOS, so wait for
  // text instead of a fixed delay.
  while (!(await b.api('GET', `/jobs/${jobId}`)).body.content) await sleep(10);
  const res = await b.api('POST', `/jobs/${jobId}/cancel`);
  assert.equal(res.status, 200);
  const { list } = await stream;
  assert.equal(list.at(-1).data.status, 'cancelled');
  const thread = (await b.api('GET', `/threads/${threadId}`)).body;
  const m = thread.messages[1];
  assert.equal(m.status, 'cancelled');
  assert.ok(m.content.length > 0 && m.content.length < 200, JSON.stringify(m));
});

test('a second question while one is running is 429', async () => {
  const b = await start({ env: { FAKE_CLAUDE_INTERVAL_MS: '30' } });
  const { contextId, threadId } = await setup(b);
  const first = await ask(b, threadId, contextId);
  const other = await b.api('POST', '/threads', {});
  const second = await ask(b, other.body.id, contextId);
  assert.equal(second.status, 429);
  assert.equal(second.body.error, 'busy');
  await waitDone(b, first.body.jobId);
  assert.equal((await ask(b, other.body.id, contextId)).status, 202);
});

test('timeout kills the CLI and records an error', async () => {
  const b = await start({
    config: { timeoutMs: 200 },
    env: {
      FAKE_CLAUDE_REPLY: 'い'.repeat(100),
      FAKE_CLAUDE_CHUNK: '1',
      FAKE_CLAUDE_INTERVAL_MS: '50',
    },
  });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  const { list } = await b.events(jobId);
  assert.equal(list.at(-1).data.status, 'error');
  assert.match(list.at(-1).data.error, /タイムアウト/);
  const m = (await b.api('GET', `/threads/${threadId}`)).body.messages[1];
  assert.equal(m.status, 'error');
});

test('an error result without text becomes status error with its message', async () => {
  const b = await start({
    env: { FAKE_CLAUDE_ERROR: 'Claude AI usage limit reached' },
  });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  const job = await waitDone(b, jobId);
  assert.equal(job.body.status, 'error');
  const m = (await b.api('GET', `/threads/${threadId}`)).body.messages[1];
  assert.equal(m.error, 'Claude AI usage limit reached');
});

test('second turn resumes the CLI session and flags a changed snapshot', async () => {
  const b = await start({ env: { FAKE_CLAUDE_REPLY: '答え' } });
  const { contextId, threadId } = await setup(b);
  await waitDone(b, (await ask(b, threadId, contextId)).body.jobId);
  const session = (await b.api('GET', `/threads/${threadId}`)).body
    .cliSessionId;

  const same = (await ask(b, threadId, contextId, '同じ版で質問')).body;
  await waitDone(b, same.jobId);
  const changed = (await b.api('PUT', '/contexts', snapshot([25]))).body
    .contextId;
  assert.notEqual(changed, contextId);
  await waitDone(
    b,
    (await ask(b, threadId, changed, '更新後の質問')).body.jobId,
  );

  const [, second, third] = await b.calls();
  assert.equal(second.args[second.args.indexOf('--resume') + 1], session);
  assert.ok(!second.stdin.includes('これまでの会話'));
  assert.ok(!second.stdin.includes(CONTEXT_CHANGED));
  assert.ok(third.args.includes('--resume'));
  assert.ok(third.stdin.includes(`収集状況の版: ${changed}`));
  assert.ok(third.stdin.includes(CONTEXT_CHANGED));
  const thread = (await b.api('GET', `/threads/${threadId}`)).body;
  assert.equal(thread.lastContextId, changed);
  assert.equal(thread.messages.length, 6);
});

test('a lost CLI session falls back to the transcript', async () => {
  const b = await start({ env: { FAKE_CLAUDE_REPLY: '一回目の答え' } });
  const { contextId, threadId } = await setup(b);
  await waitDone(b, (await ask(b, threadId, contextId, '一回目')).body.jobId);
  await b.bridge.close();

  const b2 = await start({
    env: { FAKE_CLAUDE_FAIL_RESUME: '1', FAKE_CLAUDE_REPLY: '二回目の答え' },
  });
  // Reuse the first bridge's thread by copying it into the new workspace.
  const thread1 = JSON.parse(
    await readFile(join(b.workspace, 'history', threadId + '.json'), 'utf8'),
  );
  await writeFile(
    join(b2.workspace, 'history', threadId + '.json'),
    JSON.stringify(thread1),
  );
  const ctx = (await b2.api('PUT', '/contexts', snapshot())).body.contextId;
  const job = await waitDone(
    b2,
    (await ask(b2, threadId, ctx, '二回目')).body.jobId,
  );
  assert.equal(job.body.status, 'done');
  const [resumed, fresh] = await b2.calls();
  assert.ok(resumed.args.includes('--resume'));
  assert.ok(!fresh.args.includes('--resume'));
  assert.ok(
    fresh.stdin.startsWith(
      'これまでの会話（古い順）:\n[user] 一回目\n[assistant] 一回目の答え\n---\n現在の画面:',
    ),
  );
  const thread = (await b2.api('GET', `/threads/${threadId}`)).body;
  assert.equal(thread.messages[3].content, '二回目の答え');
  assert.notEqual(thread.cliSessionId, thread1.cliSessionId);
});

test('switching the model starts a new session with the transcript', async () => {
  const b = await start({ env: { FAKE_CLAUDE_REPLY: 'はい' } });
  const { contextId, threadId } = await setup(b);
  await waitDone(b, (await ask(b, threadId, contextId, '最初')).body.jobId);
  const res = await ask(b, threadId, contextId, '次', {
    model: 'claude-sonnet-5',
  });
  await waitDone(b, res.body.jobId);
  const [, second] = await b.calls();
  assert.ok(!second.args.includes('--resume'));
  assert.equal(
    second.args[second.args.indexOf('--model') + 1],
    'claude-sonnet-5',
  );
  assert.ok(second.stdin.includes('[user] 最初\n[assistant] はい'));
  const thread = (await b.api('GET', `/threads/${threadId}`)).body;
  assert.equal(thread.model, 'claude-sonnet-5');
  assert.equal(thread.messages[3].model, 'claude-sonnet-5');
  assert.equal(
    (await ask(b, threadId, contextId, 'x', { model: 'nope' })).status,
    400,
  );
});

test('origin allowlist, preflight, token and host checks', async () => {
  const b = await start();
  const evil = await fetch(b.base + '/threads', {
    headers: {
      origin: 'https://evil.example',
      authorization: `Bearer ${b.bridge.token}`,
    },
  });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const evilHealth = await fetch(b.base + '/health', {
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(evilHealth.status, 403);
  assert.equal((await evilHealth.json()).error, 'origin_not_allowed');

  const nullOrigin = await fetch(b.base + '/health', {
    headers: { origin: 'null' },
  });
  assert.equal(nullOrigin.status, 403);

  const ok = await b.api('GET', '/threads', undefined, {
    origin: 'http://localhost:3000',
  });
  assert.equal(ok.status, 200);
  assert.equal(
    ok.headers.get('access-control-allow-origin'),
    'http://localhost:3000',
  );

  const preflight = await fetch(b.base + '/contexts', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'PUT',
      'access-control-request-private-network': 'true',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get('access-control-allow-private-network'),
    'true',
  );
  assert.match(
    preflight.headers.get('access-control-allow-headers'),
    /authorization/,
  );

  assert.equal(
    (
      await b.api('GET', '/threads', undefined, {
        authorization: 'Bearer wrong',
      })
    ).status,
    401,
  );
  assert.equal((await fetch(b.base + '/threads')).status, 401);
  assert.equal((await fetch(b.base + '/health')).status, 200);

  const port = new URL(b.base).port;
  const status = await new Promise((ok, fail) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: '/health',
        headers: { host: `attacker.example:${port}` },
      },
      (res) => {
        res.resume();
        ok(res.statusCode);
      },
    );
    req.on('error', fail);
    req.end();
  });
  assert.equal(status, 403);
});

test('null origin is accepted only when allowNullOrigin is set', async () => {
  const b = await start({ config: { allowNullOrigin: true } });
  const res = await b.api('GET', '/threads', undefined, { origin: 'null' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'null');
});

test('snapshots are content-addressed, immutable and garbage collected', async () => {
  const b = await start({ config: { contextRetention: 2 } });
  const a = await b.api('PUT', '/contexts', snapshot([1]));
  const again = await b.api('PUT', '/contexts', snapshot([1]));
  assert.equal(a.body.contextId, again.body.contextId);
  assert.equal(a.body.contextId, contextIdOf(snapshot([1])));
  assert.equal(a.body.created, true);
  assert.equal(again.body.created, false);
  const site = await b.api('PUT', '/contexts', {
    ...snapshot([1]),
    source: 'site',
  });
  assert.notEqual(site.body.contextId, a.body.contextId);
  const dir = join(b.workspace, 'contexts', a.body.contextId);
  for (const [file, head] of [
    ['routes.md', '## おすすめ攻略ルート'],
    ['bank.md', '## Bank 終了対策'],
  ]) {
    const text = await readFile(join(dir, file), 'utf8');
    assert.match(text, /- 版（contextId）: [0-9a-f]{16}/);
    assert.ok(text.includes(head), file);
  }
  const md = await readFile(join(dir, 'collection.md'), 'utf8');
  assert.match(
    md,
    /^# DEX COMPASS 収集状況\n\n- 版（contextId）: [0-9a-f]{16}\n- 保存元: 開発サーバー版（dev）\n/,
  );
  assert.ok(md.endsWith(snapshot([1]).collection));
  const saved = JSON.parse(
    await readFile(
      join(b.workspace, 'contexts', a.body.contextId, 'state.json'),
      'utf8',
    ),
  );
  assert.deepEqual(saved, state([1]));
  assert.equal(
    (await b.api('PUT', '/contexts', { ...snapshot(), source: 'x' })).status,
    400,
  );
  const { routes: _routes, ...withoutRoutes } = snapshot();
  assert.equal((await b.api('PUT', '/contexts', withoutRoutes)).status, 400);

  // Five snapshots, retention 2, one pinned by a thread.
  const { threadId } = await setup(b);
  const pinned = a.body.contextId;
  await waitDone(b, (await ask(b, threadId, pinned)).body.jobId);
  await sleep(5);
  await b.api('PUT', '/contexts', snapshot([2]));
  await sleep(5);
  const newest = (await b.api('PUT', '/contexts', snapshot([3]))).body
    .contextId;
  const removed = await b.bridge.contexts.gc(new Set([pinned]));
  const left = await readdir(join(b.workspace, 'contexts'));
  assert.ok(left.includes(pinned));
  assert.ok(left.includes(newest));
  assert.equal(left.length, 3);
  assert.equal(removed.length, 2);
});

test('deleting a thread cancels its job and removes the file', async () => {
  const b = await start({ env: { FAKE_CLAUDE_INTERVAL_MS: '30' } });
  const { contextId, threadId } = await setup(b);
  const { jobId } = (await ask(b, threadId, contextId)).body;
  await sleep(50);
  assert.equal((await b.api('DELETE', `/threads/${threadId}`)).status, 204);
  const job = await waitDone(b, jobId);
  assert.equal(job.body.status, 'cancelled');
  assert.equal((await b.api('GET', `/threads/${threadId}`)).status, 404);
  assert.equal((await b.api('DELETE', `/threads/${threadId}`)).status, 404);
});

test('extra bind addresses and origins come from the config and the env', () => {
  const base = { port: 47117, allowedOrigins: ['http://localhost:3000'] };
  assert.deepEqual(resolveConfig(base, {}).bindHosts, ['127.0.0.1']);
  const resolved = resolveConfig(
    { ...base, extraBindHosts: ['100.64.0.1'] },
    {
      CHAT_BRIDGE_HOSTS: '100.64.0.2, 127.0.0.1',
      CHAT_ALLOWED_ORIGINS: 'http://100.64.0.1:3000',
    },
  );
  assert.deepEqual(resolved.bindHosts, [
    '127.0.0.1',
    '100.64.0.1',
    '100.64.0.2',
  ]);
  assert.deepEqual(resolved.allowedOrigins, [
    'http://localhost:3000',
    'http://100.64.0.1:3000',
  ]);
  // Every bound address answers to its own Host header; localhost always does.
  assert.deepEqual(
    [...hostAllowlist(resolved.bindHosts, 47117)],
    [
      '127.0.0.1:47117',
      '100.64.0.1:47117',
      '100.64.0.2:47117',
      'localhost:47117',
    ],
  );
});

test('transcript keeps the newest messages within the limits', () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    content: `m${i}`,
  }));
  const t = buildTranscript(messages);
  assert.ok(t.startsWith('これまでの会話（古い順）:\n[user] m10\n'));
  assert.ok(t.endsWith('[assistant] m29\n---\n'));
  const long = buildTranscript([
    { role: 'user', content: 'x'.repeat(11990) },
    { role: 'assistant', content: 'y'.repeat(20) },
  ]);
  assert.equal(
    long,
    'これまでの会話（古い順）:\n[assistant] ' + 'y'.repeat(20) + '\n---\n',
  );
  assert.equal(buildTranscript([]), '');
});
