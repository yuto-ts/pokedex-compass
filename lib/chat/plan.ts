// Bodies of routes.md and bank.md: what the おすすめ攻略ルート and Bank終了対策
// pages show for the current state (docs/chat-sidebar.md §6.2).
// Kept free of browser APIs so scripts/check-engine.mjs can load it.
import {
  bankSource,
  labels,
  optimize,
  pokemon,
  priority,
  type Pokemon,
  type Route,
  type State,
} from '@/lib/dex';
import { groupIds, ranges } from './compact';

const no = (id: number) => `No.${String(id).padStart(4, '0')}`;

const tags = (r: Route) =>
  [
    `★${r.difficulty}`,
    r.dlc,
    r.trade ? '通信必要' : '',
    r.fixed ? '固定シンボル' : '',
    r.bank ? 'Bank経由' : '',
  ]
    .filter(Boolean)
    .join('、');

export function buildRoutes(s: State): string {
  const { groups, unresolved } = optimize(s);
  const entries = Object.entries(groups).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const lines = [
    '## おすすめ攻略ルート',
    '',
    `所持ソフト: ${s.owned.join('、') || 'なし'}`,
    `DLC: ${s.dlc.join('、') || 'なし'}`,
    `固定シンボル優先: ${s.fixed ? 'ON（固定 → ストーリー → NPC → 野生 → 進化 → 通信 → 特殊 → ランダムの順に比較）' : 'OFF（難易度を優先して比較）'}`,
    '',
    '未捕獲のポケモンについて、所持ソフトと DLC の条件を満たす収録済みルートを比較した結果です。★は当サイトの難易度の目安で、1 がやさしい方です。現在の進行状況や実測時間は含みません。',
    '全国図鑑 No. で示します。`25` は 1 種、`25-30` は連番です。名前は `reference/index.md`、出現場所や条件の原文は `reference/species/<4桁のNo>.md` にあります。',
    '',
  ];
  for (const [game, list] of entries) {
    lines.push(`### ${game}（${list.length}匹）`, '');
    // R4: same game, same method and same conditions become one line.
    const groups = groupIds(
      list,
      ({ r }) => `${labels[r.method] ?? r.method}（${tags(r)}）`,
      ({ p }) => p.id,
    );
    for (const [key, ids] of groups) lines.push(`- ${key}: No.${ranges(ids)}`);
    lines.push('');
  }
  if (!entries.length)
    lines.push('未捕獲のポケモンに対するおすすめルートはありません。', '');
  lines.push(
    `## 別途確認が必要（${unresolved.length}匹）`,
    '',
    'ルート未収録・所持ソフトで条件を満たさない・過去配布のみ、などの理由で自動計算から除外した未捕獲のポケモンです。入手不可という意味ではありません。',
    '',
    unresolved.length ? `No.${ranges(unresolved.map((p) => p.id))}` : 'なし',
    '',
  );
  return lines.join('\n');
}

export function buildBank(s: State): string {
  const mark = (p: Pokemon) => {
    const st = s.progress[p.id] ?? {};
    const record = [
      st.caught ? '捕獲済み' : '未捕獲',
      st.sent ? 'HOME送信済み' : 'HOME未送信',
      st.registered ? '図鑑登録済み' : '図鑑未登録',
    ].join('・');
    return `- ${no(p.id)} ${p.name}（${record}）`;
  };
  const preserved = pokemon.filter((p) => s.progress[p.id]?.preserve);
  const bankOnly = pokemon.filter(
    (p) => !s.progress[p.id]?.preserve && priority(p, s) > 0,
  );
  return [
    '## Bank 終了対策',
    '',
    'Pokémon Bank は 2027年2月26日 12:00 に終了予定です。',
    `出典: ${bankSource}`,
    '',
    '移送の手順: BW系 → ポケムーバー → Bank → HOME。X・SM・USUM → Bank → HOME。HOME のプレミアムプランと、ダウンロード済みの旧ソフトが必要です。HOME から Bank には戻せません。',
    '',
    `### 最優先: 大切な旧作個体として印を付けたもの（${preserved.length}匹）`,
    '',
    '再入手できない個体（過去配布・色違い・特殊リボンなど）としてユーザーが印を付けたポケモンです。',
    '',
    preserved.length
      ? preserved.map(mark).join('\n')
      : '印を付けたポケモンはありません。',
    '',
    `### 優先度 高: 収録ルートが旧作（Bank 経由）しかないもの（${bankOnly.length}匹）`,
    '',
    '当サイトに収録しているルートが Bank 経由の旧作だけのポケモンです。Switch 作品で入手できる場合でも、思い出の個体や過去作のフォルムは別に判断してください。',
    '',
    bankOnly.length
      ? `No.${ranges(bankOnly.map((p) => p.id))}（このうち未捕獲は ${bankOnly.filter((p) => !s.progress[p.id]?.caught).length} 匹）`
      : '該当なし。',
    '',
    '### 補足',
    '',
    'Z-A に一度連れていった個体は、過去の対応作品に戻せません。GO 産には本編への引き出し制限がある場合があります。作品ごとの入手方法は reference/species/ の各ファイルを参照してください。',
    '',
  ].join('\n');
}
