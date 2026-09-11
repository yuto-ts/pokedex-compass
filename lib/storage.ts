// The standalone HTML build aliases this module to standalone/storage.ts.
import { initial, parseState, type State } from '@/lib/state';

export class StorageError extends Error {}

let revision = 0;
let lastSaved = '';
let queue: Promise<unknown> = Promise.resolve();

async function call(init?: RequestInit) {
  const res = await fetch('/api/state', {
    ...init,
    redirect: 'manual',
    headers: { 'content-type': 'application/json' },
  }).catch(() => {
    throw new StorageError(
      'サーバーに接続できませんでした。通信状況を確認してください。',
    );
  });
  // Access redirects to its login page once the session expires.
  if (res.type === 'opaqueredirect' || res.status === 403)
    throw new StorageError(
      'ログインの有効期限が切れました。ページを再読み込みしてください。',
    );
  if (res.status === 409)
    throw new StorageError(
      '他の端末で更新されています。ページを再読み込みしてから操作してください。',
    );
  if (!res.ok)
    throw new StorageError(
      `サーバーでエラーが発生しました（HTTP ${res.status}）。`,
    );
  return (await res.json()) as { state?: unknown; revision: number };
}

export const storage = {
  label: 'サーバーに自動保存',
  note: '保存先はこのサイトのサーバー（Cloudflare D1）です。別の端末からも同じデータを参照できます。',
  async load(): Promise<State> {
    const body = await call();
    const state = body.state == null ? initial : parseState(body.state);
    revision = body.revision;
    lastSaved = JSON.stringify(state);
    return state;
  },
  save(s: State): Promise<void> {
    const run = queue.then(async () => {
      const data = JSON.stringify(s);
      if (data === lastSaved) return;
      const body = await call({
        method: 'PUT',
        body: JSON.stringify({ state: s, revision }),
      });
      revision = body.revision;
      lastSaved = data;
    });
    queue = run.catch(() => {});
    return run;
  },
};
