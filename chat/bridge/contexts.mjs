// Collection snapshots: <workspace>/contexts/<contextId>/{collection.md,state.json,meta.json}.
// A snapshot never changes after it is written, so a running job keeps
// reading the version it was started with (§5.4, §5.5).
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

const ID = /^[0-9a-f]{16}$/;

export const SOURCES = {
  site: 'サイト版',
  dev: '開発サーバー版',
  standalone: '単一 HTML 版',
};

export const isContextId = (id) => typeof id === 'string' && ID.test(id);

export function contextIdOf({ source, collection, state }) {
  return createHash('sha256')
    .update(source + '\n' + collection + '\n' + JSON.stringify(state))
    .digest('hex')
    .slice(0, 16);
}

// Local wall-clock time of the Mac running the bridge, e.g. 2026-09-12 10:32.
export function formatLocal(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export class ContextError extends Error {}

export function createContextStore(dir, { retention = 30 } = {}) {
  const path = (id) => join(dir, id);

  async function meta(id) {
    if (!isContextId(id)) return undefined;
    try {
      return JSON.parse(await readFile(join(path(id), 'meta.json'), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return undefined;
      throw e;
    }
  }

  return {
    path,
    get: meta,

    async put(body) {
      const { source, collection, state } = body ?? {};
      if (!Object.hasOwn(SOURCES, source))
        throw new ContextError('source は site / dev / standalone のいずれか');
      if (typeof collection !== 'string' || !collection)
        throw new ContextError('collection が空です');
      if (!state || typeof state !== 'object' || Array.isArray(state))
        throw new ContextError('state がオブジェクトではありません');

      const contextId = contextIdOf({ source, collection, state });
      const now = new Date().toISOString();
      const existing = await meta(contextId);
      if (existing) {
        existing.lastUsedAt = now;
        await writeFile(
          join(path(contextId), 'meta.json'),
          JSON.stringify(existing, null, 2) + '\n',
        );
        return { contextId, created: false };
      }

      const snapshot = { contextId, source, createdAt: now, lastUsedAt: now };
      const header = [
        '# DEX COMPASS 収集状況',
        '',
        `- 版（contextId）: ${contextId}`,
        `- 保存元: ${SOURCES[source]}（${source}）`,
        `- 登録時刻: ${formatLocal(now)}`,
        '',
      ].join('\n');
      // Write into a temporary directory and rename it into place, so a
      // reader never sees a half-written snapshot.
      await mkdir(dir, { recursive: true });
      const tmp = join(dir, `.tmp-${randomUUID()}`);
      await mkdir(tmp);
      await writeFile(join(tmp, 'collection.md'), header + '\n' + collection);
      await writeFile(join(tmp, 'state.json'), JSON.stringify(state, null, 2));
      await writeFile(
        join(tmp, 'meta.json'),
        JSON.stringify(snapshot, null, 2) + '\n',
      );
      try {
        await rename(tmp, path(contextId));
      } catch (e) {
        // Another request registered the same content first.
        await rm(tmp, { recursive: true, force: true });
        if (!(await meta(contextId))) throw e;
      }
      return { contextId, created: true };
    },

    // Keeps the newest `retention` snapshots plus the ids in `keep`.
    // Leftover temporary directories are removed only at startup, when no
    // PUT can be writing one.
    async gc(keep = new Set(), { removeTemp = false } = {}) {
      let names;
      try {
        names = await readdir(dir);
      } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
      }
      const snapshots = [];
      for (const name of names) {
        if (name.startsWith('.tmp-')) {
          if (removeTemp)
            await rm(path(name), { recursive: true, force: true });
          continue;
        }
        const m = await meta(name).catch(() => undefined);
        snapshots.push({
          id: name,
          at: m?.lastUsedAt ?? m?.createdAt ?? '',
        });
      }
      snapshots.sort((a, b) => b.at.localeCompare(a.at));
      const removed = [];
      for (const [i, s] of snapshots.entries()) {
        if (i < retention || keep.has(s.id)) continue;
        await rm(path(s.id), { recursive: true, force: true });
        removed.push(s.id);
      }
      return removed;
    },
  };
}
