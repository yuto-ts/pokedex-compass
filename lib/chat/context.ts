// Collection snapshot for the chat skill and the current page (docs/chat-sidebar.md §6).
import { useSyncExternalStore } from 'react';
import { pokemon, type State } from '@/lib/dex';
import { buildCollection } from './collection';
import { buildBank, buildRoutes } from './plan';
import { bridge, type Page } from './client';
import { getPrefs } from './store';

export type Source = 'site' | 'dev' | 'standalone';

let source: Source | undefined;

// The standalone HTML build calls this before rendering.
export function setChatSource(s: Source) {
  source = s;
}

function currentSource(): Source {
  if (source) return source;
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' ? 'dev' : 'site';
}

// ---- current page -------------------------------------------------------

const viewLabels: Record<string, string> = {
  dex: '全国図鑑',
  missing: '未所持ポケモン',
  legends: '伝説・幻コレクション',
  routes: 'おすすめ攻略ルート',
  bank: 'Bank終了対策',
  living: 'Living Dex',
  settings: '所持ソフト・設定',
};

let page: Page = { view: 'dex', label: viewLabels.dex };

export function setPageContext({ view, id }: { view: string; id?: number }) {
  const p = id ? pokemon.find((x) => x.id === id) : undefined;
  page = p
    ? { view, pokemonId: p.id, label: `ポケモン詳細 No.${p.id} ${p.name}` }
    : { view, label: viewLabels[view] ?? view };
}

export const getPageContext = () => page;

// ---- sync (§6.3) --------------------------------------------------------

export type SyncStatus = { loaded: boolean; syncing: boolean };

let status: SyncStatus = { loaded: false, syncing: false };
let pending: { serialized: string; state: State } | undefined;
let synced: { serialized: string; contextId: string } | undefined;
let inflight: { serialized: string; promise: Promise<string> } | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function publish(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn());
}

function push(): Promise<string> {
  const p = pending;
  if (!p) return Promise.reject(new Error('収集状況をまだ読み込んでいません'));
  if (synced?.serialized === p.serialized)
    return Promise.resolve(synced.contextId);
  if (inflight?.serialized === p.serialized) return inflight.promise;
  publish({ syncing: true });
  const promise = bridge
    .putContext({
      source: currentSource(),
      collection: buildCollection(p.state),
      routes: buildRoutes(p.state),
      bank: buildBank(p.state),
      state: p.state,
    })
    .then(({ contextId }) => {
      synced = { serialized: p.serialized, contextId };
      return contextId;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = undefined;
      publish({ syncing: !!inflight });
    });
  inflight = { serialized: p.serialized, promise };
  return promise;
}

// Called from DexApp's save effect on every state change.
export function syncCollection(state: State, loaded: boolean) {
  if (status.loaded !== loaded) publish({ loaded });
  if (!loaded) return;
  const serialized = JSON.stringify(state);
  if (pending?.serialized === serialized) return;
  pending = { serialized, state };
  clearTimeout(timer);
  // Background sync only once the chat is set up; before that a fetch to
  // 127.0.0.1 would raise the browser's local network prompt on every page.
  timer = setTimeout(() => {
    if (getPrefs().token) push().catch(() => {});
  }, 2000);
}

// Right before sending: skip the debounce if the latest state is not synced.
export function ensureSynced(): Promise<string> {
  clearTimeout(timer);
  return push();
}

// The bridge answered 409 (snapshot pruned or bridge workspace reset).
export function forgetSynced() {
  synced = undefined;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const serverStatus: SyncStatus = { loaded: false, syncing: false };

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => serverStatus,
  );
}
