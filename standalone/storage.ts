import { initial, parseState, type State } from '@/lib/state';

export class StorageError extends Error {}

const key = 'dex-compass-v1';

export const storage = {
  label: 'このブラウザに自動保存',
  note: '保存先はこのブラウザのlocalStorageです。データ削除・別端末には引き継がれません。',
  async load(): Promise<State> {
    const raw = localStorage.getItem(key);
    return raw ? parseState(JSON.parse(raw)) : initial;
  },
  async save(s: State): Promise<void> {
    localStorage.setItem(key, JSON.stringify(s));
  },
};
