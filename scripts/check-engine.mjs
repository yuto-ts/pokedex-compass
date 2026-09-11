import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
function loadTs(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, {
    module: mod,
    exports: mod.exports,
    require: (p) =>
      p.startsWith('@/lib/')
        ? loadTs('../' + p.slice(2) + '.ts')
        : p.startsWith('@/')
          ? require('../' + p.slice(2))
          : require(p),
  });
  return mod.exports;
}
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
