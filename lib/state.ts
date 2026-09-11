export const defaults = [
  'Black',
  'White',
  'X',
  'Sun',
  'Moon',
  'Ultra Sun',
  'Ultra Moon',
  'Sword',
  'Shield',
  'Legends: Arceus',
  'Scarlet',
  'Violet',
  'Legends Z-A',
];
export type Progress = {
  caught?: boolean;
  sent?: boolean;
  registered?: boolean;
  living?: boolean;
  forms?: Record<string, boolean>;
  preserve?: boolean;
};
export type State = {
  version: 1;
  owned: string[];
  dlc: string[];
  fixed: boolean;
  progress: Record<string, Progress>;
};
export const initial: State = {
  version: 1,
  owned: defaults,
  dlc: [],
  fixed: true,
  progress: {},
};
export function parseState(value: unknown): State {
  const s = value as Record<string, unknown> | null;
  if (
    !s ||
    typeof s !== 'object' ||
    s.version !== 1 ||
    !Array.isArray(s.owned) ||
    !s.owned.every((x: unknown) => typeof x === 'string') ||
    !Array.isArray(s.dlc) ||
    !s.dlc.every((x: unknown) => typeof x === 'string') ||
    typeof s.fixed !== 'boolean' ||
    typeof s.progress !== 'object' ||
    !s.progress ||
    Array.isArray(s.progress)
  )
    throw Error('invalid');
  for (const p of Object.values(s.progress)) {
    if (!p || typeof p !== 'object' || Array.isArray(p))
      throw Error('invalid progress');
    for (const [k, v] of Object.entries(p)) {
      if (k === 'forms') {
        if (
          !v ||
          typeof v !== 'object' ||
          Object.values(v).some((x) => typeof x !== 'boolean')
        )
          throw Error('invalid forms');
      } else if (typeof v !== 'boolean') throw Error('invalid flag');
    }
  }
  return { ...initial, ...s } as State;
}
