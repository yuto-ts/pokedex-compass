// DEX COMPASS chat bridge (docs/chat-sidebar.md §5). Node standard modules only.
// Start with `corepack pnpm chat`.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ContextError, createContextStore, isContextId } from './contexts.mjs';
import { HttpError, createJobManager } from './jobs.mjs';
import * as claude from './providers/claude.mjs';
import { createThreadStore, isThreadId } from './threads.mjs';

export const API_VERSION = 1;
const MAX_BODY = 2 * 1024 * 1024;
const MAX_PROMPT = 8000;
const IMPLEMENTED = { claude };

export function findExecutable(name, path = '') {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    try {
      const file = join(dir, name);
      accessSync(file, constants.X_OK);
      if (statSync(file).isFile()) return file;
    } catch {
      // not in this directory
    }
  }
  return undefined;
}

async function loadToken(workspace) {
  const file = join(workspace, '.token');
  try {
    const token = (await readFile(file, 'utf8')).trim();
    if (token) return token;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const token = randomBytes(24).toString('base64url');
  await writeFile(file, token + '\n', { mode: 0o600 });
  await chmod(file, 0o600);
  return token;
}

function sameToken(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY)
      throw new HttpError(413, 'too_large', '本文が大きすぎます');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json', 'JSON を解釈できません');
  }
}

function parsePage(page) {
  if (!page || typeof page !== 'object')
    return { view: 'unknown', label: '不明' };
  const out = {
    view: String(page.view ?? 'unknown').slice(0, 40),
    label: String(page.label ?? '不明')
      .replace(/\s+/g, ' ')
      .slice(0, 120),
  };
  if (Number.isInteger(page.pokemonId)) out.pokemonId = page.pokemonId;
  return out;
}

export async function createBridge({
  root,
  workspace,
  config,
  env = process.env,
  retentionMs,
  flushMs,
  log = (line) => console.error(line),
}) {
  for (const dir of ['contexts', 'jobs', 'history'])
    await mkdir(join(workspace, dir), { recursive: true });
  const token = await loadToken(workspace);
  const threads = createThreadStore(join(workspace, 'history'));
  const contexts = createContextStore(join(workspace, 'contexts'), {
    retention: config.contextRetention,
  });
  const jobs = createJobManager({
    root,
    workspace,
    threads,
    contexts,
    providers: IMPLEMENTED,
    config,
    env,
    retentionMs,
    flushMs,
    log,
  });

  const repaired = await threads.repair();
  if (repaired) log(`${repaired} 件の中断されたメッセージを error にしました`);
  await jobs.cleanStale();

  async function gc(options) {
    const keep = jobs.contextIds();
    for (const t of await threads.all())
      if (t.lastContextId) keep.add(t.lastContextId);
    const removed = await contexts.gc(keep, options);
    if (removed.length)
      log(`古い収集状況スナップショットを ${removed.length} 件削除しました`);
  }
  await gc({ removeTemp: true });
  const gcTimer = setInterval(
    () => gc().catch((e) => log(`gc failed: ${e.message}`)),
    60 * 60 * 1000,
  );
  gcTimer.unref();

  function providerList() {
    return Object.entries(config.providers).map(([id, p]) => {
      const adapter = IMPLEMENTED[id];
      const found = adapter && findExecutable(adapter.command, env.PATH);
      return {
        id,
        label: p.label,
        default: p.default,
        models: p.models,
        available: !!found,
        ...(!adapter
          ? { reason: 'not_implemented' }
          : !found
            ? { reason: 'not_found' }
            : {}),
      };
    });
  }

  function checkModel(provider, model) {
    const p = config.providers[provider];
    if (!p || !IMPLEMENTED[provider])
      throw new HttpError(400, 'bad_provider', `未対応の AI です: ${provider}`);
    if (!p.models.includes(model))
      throw new HttpError(400, 'bad_model', `未登録のモデルです: ${model}`);
  }

  let port = config.port;
  const hosts = () => [`127.0.0.1:${port}`, `localhost:${port}`];

  async function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;
    const method = req.method;
    const origin = req.headers.origin;
    const cors = {};
    const send = (status, body, extra = {}) => {
      const headers = { ...cors, ...extra };
      if (body === undefined) {
        res.writeHead(status, headers);
        res.end();
        return;
      }
      res.writeHead(status, {
        ...headers,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(body));
    };

    // DNS rebinding: only requests addressed to the loopback name are served.
    if (!hosts().includes(req.headers.host ?? ''))
      return send(403, { error: 'host_not_allowed' });

    const originAllowed =
      origin === undefined ||
      config.allowedOrigins.includes(origin) ||
      (origin === 'null' && config.allowNullOrigin);
    if (!originAllowed) {
      // /health tells the page why it is refused; nothing else is readable.
      const expose =
        method === 'GET' && path === '/health'
          ? { 'access-control-allow-origin': origin, vary: 'Origin' }
          : {};
      return send(403, { error: 'origin_not_allowed', origin }, expose);
    }
    if (origin !== undefined) {
      cors['access-control-allow-origin'] = origin;
      cors.vary = 'Origin';
    }

    if (method === 'OPTIONS')
      return send(204, undefined, {
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-private-network': 'true',
        'access-control-max-age': '600',
      });

    if (method === 'GET' && path === '/health')
      return send(200, { version: API_VERSION, providers: providerList() });

    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ') || !sameToken(auth.slice(7), token))
      return send(401, { error: 'unauthorized' });

    const parts = path.split('/').filter(Boolean);

    if (path === '/contexts' && method === 'PUT') {
      try {
        return send(200, await contexts.put(await readJson(req)));
      } catch (e) {
        if (e instanceof ContextError)
          throw new HttpError(400, 'bad_context', e.message);
        throw e;
      }
    }

    if (parts[0] === 'threads') {
      if (parts.length === 1 && method === 'GET')
        return send(200, { threads: await threads.list() });
      if (parts.length === 1 && method === 'POST') {
        const body = await readJson(req);
        const provider = body.provider ?? 'claude';
        const model = body.model ?? config.providers[provider]?.default;
        checkModel(provider, model);
        return send(201, await threads.create({ provider, model }));
      }
      const id = parts[1];
      if (!isThreadId(id)) throw new HttpError(404, 'thread_not_found');
      if (parts.length === 2 && method === 'GET') {
        const thread = await threads.get(id);
        if (!thread) throw new HttpError(404, 'thread_not_found');
        return send(200, thread);
      }
      if (parts.length === 2 && method === 'DELETE') {
        jobs.cancelThread(id);
        if (!(await threads.remove(id)))
          throw new HttpError(404, 'thread_not_found');
        return send(204);
      }
      if (parts.length === 3 && parts[2] === 'messages' && method === 'POST') {
        const body = await readJson(req);
        const content =
          typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) throw new HttpError(400, 'empty', '質問が空です');
        if (content.length > MAX_PROMPT)
          throw new HttpError(
            413,
            'too_long',
            `質問は ${MAX_PROMPT} 文字までです`,
          );
        if (
          !isContextId(body.contextId) ||
          !(await contexts.get(body.contextId))
        )
          throw new HttpError(
            409,
            'context_not_found',
            '収集状況の版が未登録です',
          );
        const thread = await threads.get(id);
        if (!thread) throw new HttpError(404, 'thread_not_found');
        const provider = body.provider ?? thread.provider;
        const model =
          body.model ??
          (provider === thread.provider
            ? thread.model
            : config.providers[provider]?.default);
        checkModel(provider, model);
        const started = await jobs.start({
          threadId: id,
          content,
          contextId: body.contextId,
          page: parsePage(body.page),
          provider,
          model,
        });
        return send(202, started);
      }
    }

    if (parts[0] === 'jobs' && parts.length >= 2) {
      const job = jobs.get(parts[1]);
      if (!job) throw new HttpError(404, 'job_not_found');
      if (parts.length === 2 && method === 'GET')
        return send(200, {
          status: job.status,
          threadId: job.threadId,
          messageId: job.messageId,
          contextId: job.contextId,
          content: job.content,
        });
      if (parts.length === 3 && parts[2] === 'cancel' && method === 'POST') {
        jobs.cancel(job.id);
        return send(200, { status: job.status });
      }
      if (parts.length === 3 && parts[2] === 'events' && method === 'GET') {
        res.writeHead(200, {
          ...cors,
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
        });
        res.flushHeaders();
        const write = (event, data) =>
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        write.end = () => res.end();
        const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
        const unsubscribe = jobs.subscribe(job.id, write);
        res.on('close', () => {
          clearInterval(heartbeat);
          unsubscribe?.();
        });
        return;
      }
    }

    throw new HttpError(404, 'not_found');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (res.headersSent) return res.end();
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) log(`internal error: ${e.stack ?? e}`);
      const origin = req.headers.origin;
      const allowed =
        origin !== undefined &&
        (config.allowedOrigins.includes(origin) ||
          (origin === 'null' && config.allowNullOrigin));
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        ...(allowed
          ? { 'access-control-allow-origin': origin, vary: 'Origin' }
          : {}),
      });
      res.end(
        JSON.stringify({
          error: e instanceof HttpError ? e.code : 'internal',
          message: e instanceof HttpError ? e.message : '内部エラー',
        }),
      );
    });
  });

  return {
    server,
    token,
    jobs,
    threads,
    contexts,
    async listen(p = config.port) {
      await new Promise((ok, fail) => {
        server.once('error', fail);
        server.listen(p, '127.0.0.1', ok);
      });
      port = server.address().port;
      return port;
    },
    async close() {
      clearInterval(gcTimer);
      await jobs.shutdown();
      server.closeAllConnections();
      await new Promise((ok) => server.close(() => ok()));
    },
  };
}

async function main() {
  const root = resolve(import.meta.dirname, '../..');
  const config = JSON.parse(
    readFileSync(join(root, 'chat/config.json'), 'utf8'),
  );
  const bridge = await createBridge({
    root,
    workspace: join(root, 'chat/workspace'),
    config,
  });
  const port = await bridge.listen().catch((e) => {
    console.error(
      e.code === 'EADDRINUSE'
        ? `ポート ${config.port} は使用中です。ブリッジが既に起動していないか確認してください。`
        : e.message,
    );
    process.exit(1);
  });
  console.error(
    [
      `DEX COMPASS chat bridge: http://127.0.0.1:${port}`,
      `接続トークン: ${bridge.token}`,
      '（chat/workspace/.token に保存済み。ドックの設定欄に 1 回だけ入力してください）',
      `許可 Origin: ${config.allowedOrigins.join(', ')}${config.allowNullOrigin ? ', null' : ''}`,
    ].join('\n'),
  );
  const stop = async () => {
    await bridge.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
