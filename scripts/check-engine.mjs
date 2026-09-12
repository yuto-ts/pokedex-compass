import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createLoader } from './load-ts.mjs';

const load = createLoader(resolve(import.meta.dirname, '..'));
const loadTs = (path) => load(path.replace('../', ''));

const engineModule = { exports: loadTs('../lib/dex.ts') };
const { pokemon, recommend, initial, available, optimize, parseState } =
  engineModule.exports;
assert.equal(pokemon.length, 1025);
assert.equal(new Set(pokemon.map((p) => p.id)).size, 1025);
assert.equal(pokemon[0].name, 'フシギダネ');
assert.equal(pokemon[1024].id, 1025);
const groudon = pokemon.find((p) => p.id === 383);
let state = { ...initial, owned: ['Scarlet'], dlc: [], progress: {} };
assert.equal(
  recommend(groudon, state),
  undefined,
  'DLC route must be excluded without DLC',
);
state = { ...state, dlc: ['Scarlet：ゼロの秘宝'] };
assert.equal(recommend(groudon, state).game, 'Scarlet');
assert.equal(recommend(groudon, state).trade, false);
state = { ...state, owned: ['Violet'], dlc: ['Scarlet：ゼロの秘宝'] };
assert.equal(
  recommend(groudon, state),
  undefined,
  'Other version DLC is not sufficient',
);
assert.equal(
  available(
    { game: 'Sword', method: 'event' },
    { ...initial, owned: ['Sword'] },
  ),
  false,
);
assert.equal(
  recommend(
    pokemon.find((p) => p.id === 893),
    { ...initial, owned: ['Sword'] },
  ),
  undefined,
  'Past event cannot be a current recommendation',
);
const s = { ...initial, owned: ['X'], progress: { 1: { caught: true } } };
const plan = optimize(s);
assert(
  !Object.values(plan.groups)
    .flat()
    .some((e) => e.p.id === 1),
);
assert(!plan.unresolved.some((p) => p.id === 1));
assert.equal(
  Object.values(plan.groups).flat().length + plan.unresolved.length,
  1024,
);
assert.equal(parseState(JSON.parse(JSON.stringify(initial))).version, 1);
assert.throws(() => parseState('{broken'));
assert.throws(() => parseState(null));
console.log(
  'PASS: 1,025 unique species; DLC/version constraints; past events; captured exclusion; unresolved accounting; storage errors.',
);
const dummy = { id: 2000 };
engineModule.exports.routes[2000] = [
  {
    game: 'X',
    method: 'gift',
    difficulty: 1,
    fixed: false,
    trade: false,
    source: 'test',
  },
  {
    game: 'X',
    method: 'fixed',
    difficulty: 3,
    fixed: true,
    trade: false,
    source: 'test',
  },
];
assert.equal(
  recommend(dummy, { ...initial, owned: ['X'], fixed: true }).method,
  'fixed',
);
assert.equal(
  recommend(dummy, { ...initial, owned: ['X'], fixed: false }).method,
  'gift',
);
assert.equal(
  available({ game: 'X', method: 'gift', needsReview: true }, initial),
  false,
);
assert.throws(() =>
  parseState({ ...initial, progress: { 1: { caught: 'yes' } } }),
);
console.log(
  'PASS: fixed mode vs difficulty mode; unreviewed candidates excluded; invalid flags protected.',
);
// 圧縮ルール（docs/chat-sidebar.md §6.5）の実装と、文書ごとのサイズ予算。
const { SNAPSHOT_BUDGET, membership, ranges, groupIds } = loadTs(
  '../lib/chat/compact.ts',
);
assert.equal(ranges([1, 2, 3, 7, 10, 11]), '1-3, 7, 10-11');
assert.equal(ranges([]), '');
assert.equal(ranges([5, 5, 4]), '4-5');
assert.equal(membership('捕獲済み', [], [1, 2, 3]), '- 捕獲済み: なし');
assert.equal(
  membership('捕獲済み', [1, 2, 3], [1, 2, 3]),
  '- 捕獲済み: 全 3 種',
);
assert.equal(membership('捕獲済み', [1], [1, 2, 3]), '- 捕獲済み（1匹）: 1');
assert.equal(
  membership('捕獲済み', [2, 3], [1, 2, 3]),
  '- 捕獲済み（2匹）: No.1 以外のすべて',
);
// vm 内で作られた配列なので、参照ではなく中身で比べる。
assert.equal(
  JSON.stringify(
    groupIds(
      [
        { k: 'a', id: 1 },
        { k: 'b', id: 2 },
        { k: 'a', id: 3 },
      ],
      (x) => x.k,
      (x) => x.id,
    ),
  ),
  JSON.stringify([
    ['a', [1, 3]],
    ['b', [2]],
  ]),
);

const { buildCollection } = loadTs('../lib/chat/collection.ts');
const table = buildCollection({
  ...initial,
  progress: {
    25: { caught: true, sent: true, forms: { 通常の姿: true } },
    26: { caught: true },
    150: { preserve: true },
  },
});
assert.match(table, /- 捕獲: 2 \/ 1025（未捕獲 1023）/);
assert.match(table, /- 捕獲済み（2匹）: 25-26/);
assert.match(table, /- HOME送信済み（1匹）: 25/);
assert.match(table, /- 大切な旧作個体（1匹）: 150/);
assert.match(table, /- フォルムの記録: No\.25 ピカチュウ（通常の姿）/);
assert.match(table, /第1世代（No\.1-151）: 未捕獲 149 \/ 151/);
assert.match(table, /- 幻: 未捕獲 23 \/ 23（No\.151, 251/);
// R1: the ~1,000 species with no record are not listed at all.
assert.ok(
  !table.includes('フシギダネ'),
  'species without a record are omitted',
);

const { modelLabel } = loadTs('../lib/chat/models.ts');
assert.equal(modelLabel('claude-haiku-4-5-20251001'), 'Haiku 4.5');
assert.equal(modelLabel('claude-sonnet-5'), 'Sonnet 5');
assert.equal(modelLabel('claude-fable-5-1'), 'Fable 5.1');
assert.equal(modelLabel('gpt-5.5'), 'GPT-5.5');
assert.equal(modelLabel('gpt-5.6-luna'), 'GPT-5.6 Luna');
assert.equal(modelLabel('mystery-model'), 'mystery-model');
console.log('PASS: chat model labels shorten known ids and keep unknown ones.');

const { buildRoutes, buildBank } = loadTs('../lib/chat/plan.ts');
const planState = {
  ...initial,
  owned: ['Scarlet', 'Violet'],
  dlc: [],
  progress: { 25: { caught: true }, 150: { preserve: true } },
};
const routesDoc = buildRoutes(planState);
assert.match(routesDoc, /^## おすすめ攻略ルート/);
assert.match(routesDoc, /所持ソフト: Scarlet、Violet/);
assert.ok(
  !routesDoc.includes('ピカチュウ'),
  'names live in the reference files',
);
assert.match(routesDoc, /### Scarlet（\d+匹）/);
// One line per game and method, with the species as dex-number ranges.
assert.match(routesDoc, /\n- .+（★\d[^）]*）: No\.\d/);
assert.match(routesDoc, /## 別途確認が必要（\d+匹）/);
const bankDoc = buildBank(planState);
assert.match(bankDoc, /^## Bank 終了対策/);
assert.match(
  bankDoc,
  /- No\.0150 ミュウツー（未捕獲・HOME未送信・図鑑未登録）/,
);
assert.match(bankDoc, /2027年2月26日/);
// 代表的な 4 状態で、スナップショットの 3 文書が予算内に収まることを確かめる。
const caughtUpTo = (n) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      i + 1,
      { caught: true, sent: true, registered: true },
    ]),
  );
const sizes = [];
for (const { label, progress } of [
  { label: '記録なし', progress: {} },
  {
    label: '少数',
    progress: { 25: { caught: true }, 150: { caught: true, sent: true } },
  },
  { label: '半分', progress: caughtUpTo(512) },
  { label: '全部', progress: caughtUpTo(1025) },
]) {
  const st = { ...initial, progress };
  for (const [name, text] of [
    ['collection.md', buildCollection(st)],
    ['routes.md', buildRoutes(st)],
    ['bank.md', buildBank(st)],
  ]) {
    const bytes = Buffer.byteLength(text);
    assert.ok(
      bytes <= SNAPSHOT_BUDGET,
      `${label} の ${name} が予算 ${SNAPSHOT_BUDGET} バイトを超えました（${bytes}）`,
    );
    sizes.push(`${label}/${name.replace('.md', '')} ${bytes}`);
  }
  // R3: 全部捕獲なら「全 1025 種」と書き、1,025 個の番号は並べない。
  if (label === '全部')
    assert.match(buildCollection(st), /- 捕獲済み: 全 1025 種/);
}
console.log(
  `PASS: chat snapshot documents stay within ${SNAPSHOT_BUDGET} bytes (${sizes.join(', ')}).`,
);

const { buildSpecies, buildIndex, buildSiteGuide } = loadTs(
  '../lib/chat/reference.ts',
);
const pikachu = buildSpecies(pokemon.find((p) => p.id === 25));
assert.match(pikachu, /^# No\.0025 ピカチュウ（pikachu）/);
assert.match(pikachu, /- 進化系統: No\.0172 ピチュー \/ No\.0025 ピカチュウ/);
assert.match(pikachu, /\| 作品 \| 方法 \|/);
assert.match(pikachu, /https:\/\//);
const missingRoutes = buildSpecies(pokemon.find((p) => p.id === 1000));
assert.ok(
  missingRoutes.includes('入手方法を収録していません') ||
    missingRoutes.includes('| 作品 |'),
);
assert.match(buildIndex(), /^# 全国図鑑の索引/);
assert.match(buildSiteGuide(), /^# DEX COMPASS で見られるもの/);
console.log('PASS: chat reference pages for species, index and site guide.');
