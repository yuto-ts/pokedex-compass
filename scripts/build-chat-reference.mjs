#!/usr/bin/env node
// Writes chat/workspace/reference/ — the part of the site's data that does not
// depend on the user's state (docs/chat-sidebar.md §6.2). `corepack pnpm chat`
// runs this before the bridge; it rebuilds only when the sources change.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createLoader } from './load-ts.mjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'chat/workspace/reference');
const stampFile = join(out, '.stamp');
const sources = [
  'data/pokemon.json',
  'data/routes.json',
  'data/modern-routes.json',
  'data/evolution.json',
  'lib/dex.ts',
  'lib/state.ts',
  'lib/chat/reference.ts',
];

const hash = createHash('sha256');
for (const file of sources) hash.update(await readFile(join(root, file)));
const stamp = hash.digest('hex');
const previous = await readFile(stampFile, 'utf8').catch(() => '');
if (previous.trim() === stamp && !process.argv.includes('--force')) {
  console.error('chat の参照データは最新です');
  process.exit(0);
}

const load = createLoader(root);
const { pokemon } = load('lib/dex.ts');
const { buildIndex, buildSiteGuide, buildSpecies } = load(
  'lib/chat/reference.ts',
);

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'species'), { recursive: true });
for (const p of pokemon)
  await writeFile(
    join(out, 'species', `${String(p.id).padStart(4, '0')}.md`),
    buildSpecies(p),
  );
await writeFile(join(out, 'index.md'), buildIndex());
await writeFile(join(out, 'site.md'), buildSiteGuide());
await writeFile(stampFile, stamp + '\n');
console.error(
  `chat の参照データを生成しました（${pokemon.length} 種）: ${out}`,
);
