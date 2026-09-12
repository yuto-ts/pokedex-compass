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
const { buildCollection } = loadTs('../lib/chat/collection.ts');
const table = buildCollection({
  ...initial,
  progress: {
    25: { caught: true, sent: true, forms: { 通常の姿: true } },
    150: { preserve: true },
  },
});
const rows = table.split('\n').filter((l) => /^\|\d+\|/.test(l));
assert.equal(rows.length, 1025);
assert.equal(rows[24], '|25|ピカチュウ|1|通常|捕送|通常の姿|');
assert.equal(rows[149], '|150|ミュウツー|1|伝説|大||');
assert.equal(rows[0], '|1|フシギダネ|1|通常|||');
assert.match(table, /- 捕獲: 1 \/ 1025（未捕獲 1024）/);
console.log(
  `PASS: chat collection.md lists 1,025 rows (${Buffer.byteLength(table)} bytes, ${table.length} chars).`,
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
  !routesDoc.includes('No.0025 ピカチュウ:'),
  'caught species are skipped',
);
assert.match(routesDoc, /### Scarlet（\d+匹）/);
assert.match(routesDoc, /## 別途確認が必要（\d+匹）/);
const bankDoc = buildBank(planState);
assert.match(bankDoc, /^## Bank 終了対策/);
assert.match(
  bankDoc,
  /- No\.0150 ミュウツー（未捕獲・HOME未送信・図鑑未登録）/,
);
assert.match(bankDoc, /2027年2月26日/);
console.log(
  `PASS: chat routes.md (${routesDoc.length} chars) and bank.md (${bankDoc.length} chars) describe the current state.`,
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
