// Body of collection.md for the dex-compass-collection skill (docs/chat-sidebar.md §6.2).
// Kept free of browser APIs so scripts/check-engine.mjs can load it.
import { pokemon, type Progress, type State } from '@/lib/dex';

// One short column instead of five ○ columns keeps a fully checked table
// well under the Read tool's size limit.
const codes: [keyof Progress, string][] = [
  ['caught', '捕'],
  ['sent', '送'],
  ['registered', '登'],
  ['living', 'L'],
  ['preserve', '大'],
];

// The bridge prepends the version, source and time; this is the body (§6.2).
export function buildCollection(s: State): string {
  const count = (key: keyof Progress) =>
    pokemon.filter((p) => s.progress[p.id]?.[key]).length;
  const total = pokemon.length;
  const caught = count('caught');
  const registered = count('registered');
  const rows = pokemon.map((p) => {
    const st = s.progress[p.id] ?? {};
    const forms = Object.entries(st.forms ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join('・');
    const record = codes
      .filter(([key]) => st[key])
      .map(([, c]) => c)
      .join('');
    return `|${p.id}|${p.name}|${p.gen}|${p.category}|${record}|${forms}|`;
  });
  return [
    '## 集計',
    '',
    `- 捕獲: ${caught} / ${total}（未捕獲 ${total - caught}）`,
    `- HOME 送信: ${count('sent')} / ${total}`,
    `- 図鑑登録: ${registered} / ${total}（コンプリートまで残り ${total - registered}）`,
    `- Living Dex 保管: ${count('living')} / ${total}`,
    `- 大切な旧作個体: ${count('preserve')}`,
    `- 所持ソフト: ${s.owned.join('、') || 'なし'}`,
    `- DLC: ${s.dlc.join('、') || 'なし'}`,
    `- 固定シンボル優先: ${s.fixed ? 'ON' : 'OFF'}`,
    '',
    '## 一覧',
    '',
    '記録列の略号: 捕=捕獲済み、送=HOME送信済み、登=図鑑登録済み、L=Living Dexに保管、大=大切な旧作個体。略号がなければ記録なし（未所持）。',
    'フォルム列は所持チェックを付けたフォルム名。',
    '',
    '|No.|名前|世代|分類|記録|フォルム|',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}
