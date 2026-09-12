// Body of collection.md for the dex-compass-collection skill (docs/chat-sidebar.md §6.2).
// The shape follows the compaction rules in §6.5: a row per species spent most
// of the file on the ~1,000 species with no record at all.
// Kept free of browser APIs so scripts/check-engine.mjs can load it.
import { pokemon, type Progress, type State } from '@/lib/dex';
import { membership, ranges } from './compact';

const total = pokemon.length;
const allIds = pokemon.map((p) => p.id);

export function buildCollection(s: State): string {
  const ids = (key: keyof Progress) =>
    pokemon.filter((p) => s.progress[p.id]?.[key]).map((p) => p.id);
  const caught = ids('caught');
  const registered = ids('registered');
  const uncaught = pokemon.filter((p) => !s.progress[p.id]?.caught);
  const forms = pokemon
    .map((p) => {
      const list = Object.entries(s.progress[p.id]?.forms ?? {})
        .filter(([, v]) => v)
        .map(([k]) => k);
      return list.length ? `No.${p.id} ${p.name}（${list.join('・')}）` : '';
    })
    .filter(Boolean);

  const gens = Array.from({ length: 9 }, (_, i) => {
    const gen = i + 1;
    const all = pokemon.filter((p) => p.gen === gen);
    const left = all.filter((p) => !s.progress[p.id]?.caught).length;
    return `第${gen}世代（No.${all[0].id}-${all.at(-1)?.id}）: 未捕獲 ${left} / ${all.length}`;
  });

  const categories = ['準伝説', '伝説', '幻', 'ウルトラビースト'].map((c) => {
    const left = uncaught.filter((p) => p.category === c).map((p) => p.id);
    const all = pokemon.filter((p) => p.category === c).length;
    return `- ${c}: 未捕獲 ${left.length} / ${all}${left.length ? `（No.${ranges(left)}）` : ''}`;
  });
  const normalLeft = uncaught.filter((p) => p.category === '通常').length;

  return [
    '## 集計',
    '',
    `- 捕獲: ${caught.length} / ${total}（未捕獲 ${total - caught.length}）`,
    `- HOME 送信: ${ids('sent').length} / ${total}`,
    `- 図鑑登録: ${registered.length} / ${total}（コンプリートまで残り ${total - registered.length}）`,
    `- Living Dex 保管: ${ids('living').length} / ${total}`,
    `- 大切な旧作個体: ${ids('preserve').length}`,
    `- 所持ソフト: ${s.owned.join('、') || 'なし'}`,
    `- DLC: ${s.dlc.join('、') || 'なし'}`,
    `- 固定シンボル優先: ${s.fixed ? 'ON' : 'OFF'}`,
    '',
    '## 記録',
    '',
    '全国図鑑 No. で示します。`25` は 1 種、`25-30` は 25 から 30 までの連番です。ここに出てこない No. は記録なし（未捕獲）です。',
    '',
    membership('捕獲済み', caught, allIds),
    membership('HOME送信済み', ids('sent'), allIds),
    membership('図鑑登録済み', registered, allIds),
    membership('Living Dex に保管', ids('living'), allIds),
    membership('大切な旧作個体', ids('preserve'), allIds),
    `- フォルムの記録: ${forms.length ? forms.join('、') : 'なし'}`,
    '',
    '## 世代別の未捕獲',
    '',
    gens.join(' / '),
    '',
    '## 分類別の未捕獲',
    '',
    `- 通常: 未捕獲 ${normalLeft} / ${pokemon.filter((p) => p.category === '通常').length}`,
    ...categories,
    '',
    '名前と No. の対応は `reference/index.md`、種ごとの詳細（入手方法・進化条件・フォルム一覧）は `reference/species/<4桁のNo>.md` にあります。',
    '',
  ].join('\n');
}
