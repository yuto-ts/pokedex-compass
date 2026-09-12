// Reference documents that do not depend on the user's state: what the site
// records about each species, and what each page of the site shows
// (docs/chat-sidebar.md §6.2). scripts/build-chat-reference.mjs writes them.
// Kept free of browser APIs so that script and check-engine can load it.
import evolutionData from '@/data/evolution.json';
import { labels, pokemon, routes, type Pokemon } from '@/lib/dex';

const evolutions: Record<string, { gameGroup: string; text: string }[]> =
  evolutionData;

export const speciesFile = (id: number) =>
  `reference/species/${String(id).padStart(4, '0')}.md`;

const no = (id: number) => `No.${String(id).padStart(4, '0')}`;
const cell = (v: string) => v.replace(/\|/g, '｜').replace(/\n/g, ' ');

// Evolution stage, so a family reads from the first stage down. Branches
// (イーブイ など) share a stage, so the members are listed, not chained.
function stage(p: Pokemon, hops = 0): number {
  const parent = p.parent > 0 ? pokemon[p.parent - 1] : undefined;
  return parent && hops < 5 ? stage(parent, hops + 1) + 1 : 0;
}

export function buildSpecies(p: Pokemon): string {
  const family = pokemon
    .filter((x) => x.chain === p.chain)
    .sort((a, b) => stage(a) - stage(b) || a.id - b.id);
  const list = routes[p.id] ?? [];
  const evo = evolutions[p.id] ?? [];
  const lines = [
    `# ${no(p.id)} ${p.name}（${p.en}）`,
    '',
    `- 世代: 第${p.gen}世代`,
    `- 分類: ${p.category}`,
    `- タイプ: ${p.types.join('・')}`,
    `- フォルム（種の図鑑登録とは別に管理するもの）: ${p.forms.length ? ['通常の姿', ...p.forms].join('、') : '通常の姿のみ'}`,
    `- 進化系統: ${family
      .map(
        (x) =>
          `${no(x.id)} ${x.name}${x.parent > 0 ? `（${pokemon[x.parent - 1]?.name}から進化）` : ''}`,
      )
      .join(' / ')}`,
    '',
    '## この種へ進化する条件',
    '',
  ];
  lines.push(
    evo.length
      ? evo.map((e) => `- ${e.gameGroup}: ${e.text}`).join('\n')
      : 'この種へ進化する条件のデータはありません。',
    '',
    '出典: https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_evolution.csv',
    '',
    '## 収録している入手方法',
    '',
  );
  if (!list.length)
    lines.push(
      '当サイトには入手方法を収録していません。入手できないという意味ではありません。',
      '',
    );
  else {
    lines.push(
      '| 作品 | 方法 | 条件・場所 | 難易度 | 固定 | 通信 | DLC | Bank経由 | 状態 | 出典 |',
      '|---|---|---|---|---|---|---|---|---|---|',
      ...list.map((r) =>
        [
          '',
          r.game,
          labels[r.method] ?? r.method,
          cell(r.text),
          `★${r.difficulty}`,
          r.fixed ? '○' : '',
          r.trade ? '○' : '',
          r.dlc ?? '',
          r.bank ? '○' : '',
          [r.status, r.needsReview ? '条件を要確認' : '']
            .filter(Boolean)
            .join('・'),
          r.source,
          '',
        ].join('|'),
      ),
      '',
      '難易度（★）は当サイトの目安です。「過去配布」「現在入手不可」「条件を要確認」の行は、おすすめの自動計算から除外しています。',
      '',
    );
  }
  return lines.join('\n');
}

export function buildIndex(): string {
  const lines = [
    '# 全国図鑑の索引（No. と名前だけ）',
    '',
    '`reference/species/<4桁のNo>.md` に 1 種ずつの詳細（タイプ・分類・フォルム・進化条件・作品別の入手方法）があります。',
    'No. が分かっているならこの索引を読まずに直接そのファイルを読んでください。番号に確信が持てないときの引き当て用です。',
    '',
  ];
  for (let gen = 1; gen <= 9; gen++) {
    const list = pokemon.filter((p) => p.gen === gen);
    lines.push(
      `## 第${gen}世代（${list[0].id}〜${list.at(-1)?.id}）`,
      '',
      list.map((p) => `${String(p.id).padStart(4, '0')} ${p.name}`).join(' / '),
      '',
    );
  }
  return lines.join('\n');
}

export function buildSiteGuide(): string {
  return [
    '# DEX COMPASS で見られるもの',
    '',
    'DEX COMPASS は全国図鑑 1,025 種の収集を管理する非公式ツールです。画面ごとの内容は次のとおりです。',
    '',
    '- 全国図鑑: 全 1,025 種の一覧。名前（日本語・ひらがな・英語）と図鑑 No. で検索し、タイプ・世代・分類・収集状況・入手条件・難易度で絞り込めます。',
    '- 未所持ポケモン: 捕獲の記録が無い種の一覧と、世代別・分類別の残り数。',
    '- 伝説・幻コレクション: 分類が通常以外の種の一覧。幻は入手状況（恒常入手可能・DLC で入手可能・GO で入手可能・過去配布のみ・現在入手困難）で絞り込めます。',
    '- おすすめ攻略ルート: 未捕獲の種について、所持ソフトと DLC の条件を満たす収録ルートを比較した結果。作品ごとにまとまっています（data/routes.md）。',
    '- Bank終了対策: Pokémon Bank の終了に向けて移送を検討する種の一覧と手順（data/bank.md）。',
    '- Living Dex: 図鑑登録とは別に、各種の個体を手元に保管したかの記録。',
    '- 所持ソフト・設定: 所持ソフト、DLC、固定シンボル優先の切り替え。',
    '- ポケモン詳細: 分類・タイプ・フォルム・進化系統・進化条件と、作品ごとの入手方法（reference/species/<4桁のNo>.md）。',
    '',
    '## 用語と目安',
    '',
    '- 記録は「捕獲」「HOME送信」「図鑑登録」「Living Dex 保管」「大切な旧作個体」「フォルムごとの所持」の 6 種類です。',
    '- 難易度（★1〜5）は当サイトの目安で、ストーリーや DLC の進行時間も含みます。実測時間ではありません。',
    '- 「準伝説」は当サイトの便宜的な分類です。公式の区分ではありません。',
    '- 固定シンボル優先が ON のときは、固定 → ストーリー → NPC → 野生 → 進化 → 通信 → 特殊 → ランダムの順で比較します。OFF のときは難易度を優先します。',
    '',
    '## データの範囲と限界',
    '',
    '- 基本情報・フォルム・進化条件は PokeAPI の公開 CSV、旧作の通常草むら出現は PokeAPI の encounters、Switch 作品の入手場所は Serebii の Locations 表、手動で確認したルートは出典付きでリポジトリに収録しています。確認日は 2026-09-08 です。',
    '- 全作品の全入手方法を検証したデータベースではありません。収録が無いことは入手不可を意味しません。フォルム一覧も HOME に保管できる全バリエーションとは限りません。',
    '- 過去配布は現在開催中のイベントとしては扱いません。Pokémon GO のイベントは都度公式発表を確認してください。',
    '',
  ].join('\n');
}
