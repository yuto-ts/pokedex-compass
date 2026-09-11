import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const outFile = resolve(root, 'dist-html/index.html');

const [result] = await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@/lib/href', replacement: resolve(root, 'standalone/href.ts') },
      {
        find: '@/lib/storage',
        replacement: resolve(root, 'standalone/storage.ts'),
      },
      { find: 'next/link', replacement: resolve(root, 'standalone/link.tsx') },
      {
        find: 'next/image',
        replacement: resolve(root, 'standalone/image.tsx'),
      },
      { find: /^@\//, replacement: root + '/' },
    ],
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    write: false,
    lib: {
      entry: resolve(root, 'standalone/main.tsx'),
      name: 'DexCompass',
      formats: ['iife'],
      fileName: () => 'app.js',
    },
  },
});

const chunks = result.output;
const js = chunks
  .filter((c) => c.type === 'chunk')
  .map((c) => c.code)
  .join('\n')
  .replace(/<\/script/gi, '<\\/script');
const css = chunks
  .filter((c) => c.type === 'asset' && c.fileName.endsWith('.css'))
  .map((c) => c.source)
  .join('\n')
  .replace(/<\/style/gi, '<\\/style');

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DEX COMPASS | 全国図鑑コンプリート</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<noscript>DEX COMPASS は JavaScript を有効にして開いてください。</noscript>
<script>${js}</script>
</body>
</html>
`;

await mkdir(resolve(root, 'dist-html'), { recursive: true });
await writeFile(outFile, html);
console.log(
  `Created ${outFile} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB)`,
);
