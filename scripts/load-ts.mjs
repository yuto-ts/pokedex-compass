// Loads a TypeScript module from Node without a build step, resolving the
// project's `@/` imports. Used by check-engine.mjs and build-chat-reference.mjs.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

export function createLoader(root) {
  const require = createRequire(resolve(root, 'package.json'));
  const cache = new Map();
  function load(path) {
    const file = resolve(root, path);
    const cached = cache.get(file);
    if (cached) return cached;
    const js = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const mod = { exports: {} };
    cache.set(file, mod.exports);
    vm.runInNewContext(js, {
      module: mod,
      exports: mod.exports,
      require: (p) =>
        p.startsWith('@/') && !p.endsWith('.json')
          ? load(p.slice(2) + '.ts')
          : p.startsWith('@/')
            ? require(resolve(root, p.slice(2)))
            : p.startsWith('./')
              ? load(resolve(file, '..', p) + '.ts')
              : require(p),
    });
    cache.set(file, mod.exports);
    return mod.exports;
  }
  return load;
}
