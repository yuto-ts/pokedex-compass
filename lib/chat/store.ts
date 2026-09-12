// Chat dock state kept across full-page navigations (docs/chat-sidebar.md §7.3).
// Answer text is not stored here; the bridge job and thread file own it.
import { useSyncExternalStore } from 'react';
import { DEFAULT_WIDTH, PREFS_KEY, clampWidth } from './layout';

export { MAX_WIDTH, MIN_WIDTH, clampWidth } from './layout';

export type ChatPrefs = {
  open: boolean;
  width: number;
  provider: string;
  model: string;
  threadId: string | null;
  draft: string;
  token: string;
};

const defaults: ChatPrefs = {
  open: false,
  width: DEFAULT_WIDTH,
  provider: 'claude',
  model: '',
  threadId: null,
  draft: '',
  token: '',
};

const str = (v: unknown, fallback: string) =>
  typeof v === 'string' ? v : fallback;
const id = (v: unknown) => (typeof v === 'string' && v ? v : null);

function read(): ChatPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaults;
    const v = JSON.parse(raw) as Record<string, unknown>;
    return {
      open: v.open === true,
      width: clampWidth(Number(v.width)),
      provider: str(v.provider, defaults.provider),
      model: str(v.model, ''),
      threadId: id(v.threadId),
      draft: str(v.draft, ''),
      token: str(v.token, ''),
    };
  } catch {
    return defaults;
  }
}

let current = defaults;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  current = read();
  // Other tabs of the same site follow the open thread, width and so on.
  window.addEventListener('storage', (e) => {
    if (e.key !== PREFS_KEY) return;
    current = read();
    emit();
  });
}

export function getPrefs(): ChatPrefs {
  start();
  return current;
}

export function setPrefs(patch: Partial<ChatPrefs>) {
  start();
  current = { ...current, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(current));
  } catch {
    // Storage full or blocked: the dock still works for this page.
  }
  emit();
}

function subscribe(fn: () => void) {
  start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function usePrefs(): ChatPrefs {
  return useSyncExternalStore(subscribe, getPrefs, () => defaults);
}
