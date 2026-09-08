import raw from '@/data/pokemon.json';
import imported from '@/data/routes.json';
import modern from '@/data/modern-routes.json';
export type Pokemon = (typeof raw)[number];
export type Route = {
  needsReview?: boolean;
  imported?: boolean;
  game: string;
  method: string;
  text: string;
  difficulty: number;
  fixed: boolean;
  trade: boolean;
  source: string;
  dlc?: string;
  bank?: boolean;
  status?: string;
  requires?: string[];
};
export const pokemon: Pokemon[] = raw;
export const games = [
  'Black',
  'White',
  'Black 2',
  'White 2',
  'X',
  'Y',
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
  'Pokémon GO',
];
export const dlcs = [
  'Sword：鎧の孤島',
  'Sword：冠の雪原',
  'Shield：鎧の孤島',
  'Shield：冠の雪原',
  'Scarlet：ゼロの秘宝',
  'Violet：ゼロの秘宝',
  'Z-A：M次元ラッシュ',
];
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
export const routes: Record<string, Route[]> = imported;
const sv = 'https://www.serebii.net/scarletviolet/snacksworthlegendary.shtml';
const za = 'https://www.serebii.net/legendsz-a/legendary.shtml';
function add(
  id: number,
  game: string,
  method: string,
  text: string,
  difficulty: number,
  source: string,
  extra: Partial<Route> = {},
) {
  (routes[id] ??= []).push({
    game,
    method,
    text,
    difficulty,
    source,
    fixed: method === 'fixed' || method === 'story',
    trade: method === 'trade',
    ...extra,
  });
}
for (const id of [1, 4, 7])
  add(
    id,
    'X',
    'gift',
    'ミアレシティのプラターヌ研究所で3匹から1匹を選択。残りは別周回または交換。',
    1,
    'https://www.serebii.net/xy/gift.shtml',
    { bank: true },
  );
for (const [id, parent, level] of [
  [2, 1, 16],
  [3, 2, 32],
  [5, 4, 16],
  [6, 5, 36],
  [8, 7, 16],
  [9, 8, 36],
])
  add(
    id,
    'X',
    'evolution',
    `${pokemon[parent - 1].name}をLv.${level}にして進化。進化前個体が必要。`,
    2,
    'https://www.serebii.net/pokedex-xy/' +
      String(id).padStart(3, '0') +
      '.shtml',
    { bank: true },
  );
add(
  716,
  'X',
  'story',
  'フレア団秘密基地でストーリー中に捕獲。',
  1,
  'https://www.serebii.net/xy/legendary.shtml',
  { bank: true },
);
add(
  717,
  'Y',
  'story',
  'フレア団秘密基地でストーリー中に捕獲。Y限定。',
  1,
  'https://www.serebii.net/xy/legendary.shtml',
  { bank: true },
);
add(
  717,
  'Ultra Moon',
  'random',
  'ウルトラワープライドの赤いワープホール。出現先はランダム。',
  4,
  'https://www.serebii.net/ultrasunultramoon/ultrawormholes.shtml',
  { bank: true },
);
for (const id of [716, 717, 718])
  add(
    id,
    'Legends Z-A',
    'fixed',
    'メインストーリー終了後の伝説ポケモンのミッションを進めて捕獲。',
    3,
    za,
  );
for (const [id, solo] of [
  [144, 'Scarlet'],
  [145, 'Scarlet'],
  [146, 'Scarlet'],
  [243, 'Scarlet'],
  [244, 'Scarlet'],
  [245, 'Scarlet'],
  [250, 'Scarlet'],
  [381, 'Scarlet'],
  [383, 'Scarlet'],
  [643, 'Scarlet'],
  [791, 'Scarlet'],
  [896, 'Scarlet'],
  [249, 'Violet'],
  [380, 'Violet'],
  [382, 'Violet'],
  [638, 'Violet'],
  [639, 'Violet'],
  [640, 'Violet'],
  [644, 'Violet'],
  [792, 'Violet'],
  [897, 'Violet'],
] as [number, string][]) {
  for (const game of ['Scarlet', 'Violet'])
    add(
      id,
      game,
      'fixed',
      `藍の円盤クリア後、おやつおやじから${game === solo ? 'ソロBPミッション' : 'サークルミッション'}報酬のおやつを受け取り固定地点で捕獲。おやつの順番はランダム。`,
      3,
      sv,
      { dlc: game + '：ゼロの秘宝', trade: game !== solo },
    );
}
for (const id of [384, 646, 800])
  for (const game of ['Scarlet', 'Violet'])
    add(
      id,
      game,
      'fixed',
      '藍の円盤クリア後、サークルミッションのおやつを受け取り固定地点で捕獲。',
      3,
      sv,
      { dlc: game + '：ゼロの秘宝', trade: true },
    );
for (const id of [793, 794, 795, 796, 797, 798, 799, 805, 806])
  for (const game of ['Sword', 'Shield'])
    add(
      id,
      game,
      'random',
      '冠の雪原の伝説の手がかりを進め、UB解禁後にダイマックスアドベンチャーで捕獲。',
      4,
      'https://www.serebii.net/swordshield/dynamaxadventurespokemon.shtml',
      { dlc: game + '：冠の雪原' },
    );
add(
  491,
  'Legends Z-A',
  'special',
  'M次元ラッシュのストーリーを進め、ダークライの暴走メガシンカ戦を攻略。',
  4,
  za,
  { dlc: 'Z-A：M次元ラッシュ', status: 'DLCで入手可能' },
);
add(
  720,
  'Legends Z-A',
  'special',
  'レックウザ攻略後、ホテルZのイベントからいましめのツボに関するミッションを進める。',
  4,
  za,
  { dlc: 'Z-A：M次元ラッシュ', status: 'DLCで入手可能' },
);
add(
  807,
  'Legends Z-A',
  'special',
  'レックウザ攻略、ディアンシー・ミュウツーの捕獲と関連サイドミッションが前提。パチパチキャンディからプラズマドーナツを作り、暴走メガゼラオラ戦へ。',
  4,
  za,
  { dlc: 'Z-A：M次元ラッシュ', status: 'DLCで入手可能' },
);
for (const game of ['Sun', 'Moon'])
  add(
    801,
    game,
    'gift',
    '殿堂入り後、対応するマギアナのQRコードを読み取り、ハウオリシティで受取。',
    1,
    'https://www.pokemon.co.jp/ex/sun_moon/topics/160701_01.html',
    { bank: true, status: '恒常入手可能' },
  );
add(
  893,
  'Sword',
  'event',
  '過去の配布個体。現在の本編恒常入手ルートとしては扱いません。正規個体の交換や再配布を確認。',
  5,
  'https://www.serebii.net/pokedex-swsh/zarude/',
  { status: '過去配布のみ' },
);
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
export const bankSource =
  'https://www.pokemon.co.jp/info/2022/02/220216_gm01.html?rss=260813';
export function available(r: Route, s: State) {
  return (
    s.owned.includes(r.game) &&
    (!r.dlc || s.dlc.includes(r.dlc)) &&
    (!r.requires || r.requires.every((g) => s.owned.includes(g))) &&
    !r.needsReview &&
    r.method !== 'event' &&
    r.method !== 'unavailable'
  );
}
export function score(r: Route, s: State) {
  const priority: Record<string, number> = {
    fixed: 0,
    story: 1,
    gift: 2,
    wild: 3,
    evolution: 4,
    trade: 5,
    special: 6,
    random: 7,
    event: 8,
    unavailable: 9,
  };
  return s.fixed
    ? (priority[r.method] ?? 6) * 100 +
        r.difficulty * 10 +
        (r.trade ? 6 : 0) +
        (r.bank ? 3 : 0)
    : r.difficulty * 100 +
        (priority[r.method] ?? 6) * 5 +
        (r.trade ? 15 : 0) +
        (r.bank ? 3 : 0);
}
export function recommend(p: Pokemon, s: State) {
  return (routes[p.id] ?? [])
    .filter((r) => available(r, s))
    .sort(
      (a, b) => score(a, s) - score(b, s) || a.game.localeCompare(b.game),
    )[0];
}
export function priority(p: Pokemon, s: State) {
  if (s.progress[p.id]?.preserve) return 2;
  const rs = routes[p.id] ?? [];
  if (p.id === 801 && !s.dlc.includes('Z-A：M次元ラッシュ')) return 2;
  if (
    rs.some((r) => r.bank) &&
    !rs.some((r) => !r.bank && r.method !== 'event')
  )
    return 1;
  return 0;
}
export function optimize(s: State) {
  const groups: Record<string, { p: Pokemon; r: Route }[]> = {};
  const unresolved: Pokemon[] = [];
  for (const p of pokemon) {
    if (s.progress[p.id]?.caught) continue;
    const r = recommend(p, s);
    if (r) (groups[r.game] ??= []).push({ p, r });
    else unresolved.push(p);
  }
  return { groups, unresolved };
}
export const labels: Record<string, string> = {
  fixed: '固定シンボル',
  story: 'ストーリー確定',
  gift: 'NPCから受取',
  wild: '野生出現',
  evolution: '進化',
  trade: '通信交換',
  special: '特殊条件',
  random: 'ランダム遭遇',
  event: '過去配布',
  unavailable: '現在入手不可',
};
export const storage = {
  load(): State {
    const raw = localStorage.getItem('dex-compass-v1');
    if (!raw) return initial;
    const s = JSON.parse(raw);
    if (
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
    return { ...initial, ...s };
  },
  save(s: State) {
    localStorage.setItem('dex-compass-v1', JSON.stringify(s));
  },
};
const pla = 'https://www.serebii.net/legendsarceus/legendary.shtml';
for (const id of [489, 490])
  add(
    id,
    'Legends: Arceus',
    'fixed',
    'サブ任務「海の伝説」。ブイゼル・タマンタ・ハリーマンを手持ちに入れ、夕方に群青の海岸の海上の門を通過し、海辺の小穴へ。',
    3,
    pla,
    { status: '恒常入手可能' },
  );
for (const game of ['Sword', 'Shield'])
  add(
    492,
    'Legends: Arceus',
    'fixed',
    `${game}のセーブデータがある本体で、サブ任務「ありがとうを伝えたい」を進めて捕獲。`,
    2,
    pla,
    { requires: [game], status: '恒常入手可能' },
  );
add(
  493,
  'Legends: Arceus',
  'special',
  'フィオネ・マナフィ・シェイミ・ダークライ・アルセウスを除くヒスイのポケモンを捕獲し、最終任務の戦いを攻略。',
  4,
  pla,
  { status: '恒常入手可能' },
);
add(
  808,
  'Pokémon GO',
  'special',
  'HOMEにポケモンを送り、ふしぎなはこを開けてメルタンを捕獲。色違いの出現はイベント時に別途確認。',
  2,
  'https://swordshield.pokemon.com/en-ca/expansionpass/pokemon-go-connectivity/',
  { status: 'GOで入手可能' },
);
add(
  809,
  'Pokémon GO',
  'gift',
  'GOからHOMEへの初回転送後、スマートフォン版HOMEのふしぎなおくりものでメルメタルを受取。',
  1,
  'https://support.pokemon.com/hc/en-us/articles/360052041491-When-transferring-a-Pok%C3%A9mon-from-Pok%C3%A9mon-GO-to-Pok%C3%A9mon-HOME-for-the-first-time-a-special-Melmetal-capable-of-Gigantamaxing-becomes-available-in-Pok%C3%A9mon-HOME-How-do-I-receive-this-Melmetal',
  { status: 'GOで入手可能' },
);
add(
  801,
  'Legends Z-A',
  'gift',
  'M次元ラッシュでレックウザ攻略後、関連サイドミッションを進め、メガカケラ999個を用意。',
  4,
  za,
  { dlc: 'Z-A：M次元ラッシュ', status: 'DLCで入手可能' },
);
add(
  802,
  'Legends Z-A',
  'special',
  'M次元ラッシュのレックウザ攻略後、影と時刻が条件のサイドミッションを進める。',
  4,
  za,
  { dlc: 'Z-A：M次元ラッシュ', status: 'DLCで入手可能' },
);

// Source table imports are added after curated records so incomplete duplicates cannot outrank them.
for (const [id, entries] of Object.entries(modern)) {
  const p = pokemon[Number(id) - 1];
  for (const raw of entries) {
    const r: Route = { ...raw };
    if (
      (routes[id] ?? []).some(
        (x) => !x.imported && x.game === r.game && x.dlc === r.dlc,
      )
    )
      continue;
    if (
      p.category === '幻' ||
      r.text.includes('Snacksworth') ||
      r.text.toLowerCase().includes('save data')
    ) {
      r.needsReview = true;
      r.status = '入手条件を要確認';
    }
    const fixed = r.text.match(/Fixed:\s*(.*?)(?:Tera Raid|Max Raid|$)/);
    if (fixed) {
      r.fixed = true;
      r.method = 'fixed';
      r.text =
        '固定地点（出典表記）：' +
        fixed[1].trim() +
        '。出現条件・時間帯は出典で確認。';
    }
    if (r.text.includes('Wild Zone') && r.method === 'special')
      r.method = 'wild';
    if (r.text.includes('In-Game Trade')) r.trade = false;
    (routes[id] ??= []).push(r);
  }
}
