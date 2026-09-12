// Thread history: one JSON file per thread under <workspace>/history/.
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isThreadId = (id) => typeof id === 'string' && UUID.test(id);

export const INTERRUPTED = 'ブリッジが停止したため中断しました';

export function createThreadStore(dir) {
  const queues = new Map();
  const file = (id) => join(dir, id + '.json');

  // Reads and writes of one thread run one at a time, so the 500 ms flush,
  // new messages, the final write of a job and deletion never interleave.
  function serial(id, fn) {
    const run = (queues.get(id) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    queues.set(id, tail);
    tail.then(() => {
      if (queues.get(id) === tail) queues.delete(id);
    });
    return run;
  }

  async function read(id) {
    if (!isThreadId(id)) return undefined;
    try {
      return JSON.parse(await readFile(file(id), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return undefined;
      throw e;
    }
  }

  async function write(thread) {
    await mkdir(dir, { recursive: true });
    const tmp = `${file(thread.id)}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(thread, null, 2) + '\n');
    await rename(tmp, file(thread.id));
  }

  async function ids() {
    try {
      return (await readdir(dir))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .filter(isThreadId);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  async function all() {
    const out = [];
    for (const id of await ids()) {
      // A broken file must not hide the other threads.
      const thread = await serial(id, () => read(id)).catch(() => undefined);
      if (thread) out.push(thread);
    }
    return out;
  }

  return {
    get: (id) => serial(id, () => read(id)),

    all,

    async list() {
      return (await all())
        .map(({ id, title, provider, model, updatedAt }) => ({
          id,
          title,
          provider,
          model,
          updatedAt,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async create({ provider, model }) {
      const now = new Date().toISOString();
      const thread = {
        id: randomUUID(),
        title: '新しいスレッド',
        provider,
        model,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      await serial(thread.id, () => write(thread));
      return thread;
    },

    // fn mutates the thread in place (return false to skip the write).
    // Resolves to undefined when the thread no longer exists.
    update(id, fn) {
      return serial(id, async () => {
        const thread = await read(id);
        if (!thread) return undefined;
        if ((await fn(thread)) === false) return thread;
        await write(thread);
        return thread;
      });
    },

    async remove(id) {
      if (!isThreadId(id)) return false;
      return serial(id, async () => {
        const existed = !!(await read(id));
        await rm(file(id), { force: true });
        return existed;
      });
    },

    // Messages left as `streaming` belong to a bridge that stopped mid-job.
    async repair() {
      let fixed = 0;
      for (const id of await ids()) {
        await this.update(id, (t) => {
          const stale = t.messages.filter((m) => m.status === 'streaming');
          for (const m of stale) {
            m.status = 'error';
            m.error = INTERRUPTED;
            delete m.jobId;
          }
          fixed += stale.length;
          return stale.length > 0;
        }).catch(() => {});
      }
      return fixed;
    },
  };
}
