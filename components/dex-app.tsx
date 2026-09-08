'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import evolutionData from '@/data/evolution.json';
const evolutions: Record<string, { gameGroup: string; text: string }[]> =
  evolutionData;
import {
  BookOpen,
  Search,
  Settings,
  Route as RouteIcon,
  ShieldAlert,
  ArrowRight,
  Grid2X2,
  List,
  Cloud,
  Gamepad2,
  Sparkles,
  Package,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ExternalLink,
  Target,
  Archive,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Progress as ProgressBar } from '@/components/ui/progress';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import {
  pokemon,
  routes,
  games,
  dlcs,
  initial,
  recommend,
  priority,
  optimize,
  labels,
  storage,
  available,
  score,
  bankSource,
  type Pokemon,
  type State,
  type Progress,
} from '@/lib/dex';
const navs = [
  ['/', '全国図鑑', BookOpen],
  ['/missing', '未所持ポケモン', Package],
  ['/legends', '伝説・幻コレクション', Sparkles],
  ['/routes', 'おすすめ攻略ルート', RouteIcon],
  ['/bank', 'Bank終了対策', ShieldAlert],
  ['/living', 'Living Dex', Archive],
  ['/settings', '所持ソフト・設定', Settings],
] as const;
const colors: Record<string, string> = {
  くさ: 'grass',
  どく: 'poison',
  ほのお: 'fire',
  みず: 'water',
  ひこう: 'flying',
  むし: 'bug',
  ノーマル: 'normal',
  でんき: 'electric',
  エスパー: 'psychic',
  ドラゴン: 'dragon',
  フェアリー: 'fairy',
};
function Pic({ p }: { p: Pokemon }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="image-fallback">No.{p.id}</div>
  ) : (
    <Image
      unoptimized
      className="poke-image"
      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`}
      width={150}
      height={150}
      alt={p.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
function Stars({ n }: { n?: number }) {
  return (
    <span className="stars" aria-label={n ? `難易度 ${n} / 5` : '難易度未確認'}>
      {n ? (
        <>
          {'★'.repeat(n)}
          <span>{'★'.repeat(5 - n)}</span>
        </>
      ) : (
        '難易度 未確認'
      )}
    </span>
  );
}
function Choice({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  items: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? 'すべて')}>
      <SelectTrigger aria-label={label}>
        <SelectValue>{value === 'すべて' ? label : value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i} value={i}>
            {i === 'すべて' ? label + '：すべて' : i}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Flag({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flag">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span>{children}</span>
    </label>
  );
}
export default function DexApp({
  view = 'dex',
  id,
}: {
  view?: string;
  id?: number;
}) {
  const [s, setS] = useState<State>(initial),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState('');
  const [q, setQ] = useState(''),
    [category, setCategory] = useState('すべて'),
    [gen, setGen] = useState('すべて'),
    [type, setType] = useState('すべて'),
    [status, setStatus] = useState('すべて'),
    [extra, setExtra] = useState('すべて'),
    [difficulty, setDifficulty] = useState('すべて'),
    [myth, setMyth] = useState('すべて'),
    [layout, setLayout] = useState('grid'),
    [page, setPage] = useState(1),
    [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => storage.load())
      .then((value) => {
        if (active) {
          setS(value);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active)
          setError(
            '保存データを読み込めませんでした。既存データの上書きを停止しています。',
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) storage.save(s);
      })
      .then(() => {
        if (active) setError('');
      })
      .catch(() => {
        if (active)
          setError(
            '保存できませんでした。ブラウザのストレージ設定をご確認ください。',
          );
      });
    return () => {
      active = false;
    };
  }, [s, loaded]);
  const filterKey = JSON.stringify([
    q,
    category,
    gen,
    type,
    status,
    extra,
    difficulty,
    myth,
  ]);
  const [previousFilters, setPreviousFilters] = useState(filterKey);
  if (previousFilters !== filterKey) {
    setPreviousFilters(filterKey);
    setPage(1);
  }
  const update = (pid: number, key: keyof Progress, value: boolean) =>
    setS((old) => ({
      ...old,
      progress: {
        ...old.progress,
        [pid]: { ...old.progress[pid], [key]: value },
      },
    }));
  const count = (key: keyof Progress) =>
    pokemon.filter((p) => s.progress[p.id]?.[key]).length;
  const caught = count('caught'),
    registered = count('registered'),
    sent = count('sent');
  const result = useMemo(
    () =>
      pokemon.filter((p) => {
        const r = recommend(p, s),
          st = s.progress[p.id] ?? {};
        const query = q
          .trim()
          .normalize('NFKC')
          .toLowerCase()
          .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 96))
          .replace(/^#|^no\./, '');
        return (
          (!query ||
            p.name.includes(query) ||
            p.en.includes(query) ||
            (/^\d+$/.test(query) && p.id === Number(query))) &&
          (view !== 'missing' || !st.caught) &&
          (view !== 'legends' || p.category !== '通常') &&
          (view !== 'bank' || priority(p, s) > 0) &&
          (category === 'すべて' || p.category === category) &&
          (gen === 'すべて' || p.gen === Number(gen.replace(/\D/g, ''))) &&
          (type === 'すべて' || p.types.includes(type)) &&
          (status === 'すべて' ||
            (status === '未所持'
              ? !st.caught
              : status === '捕獲済み'
                ? st.caught
                : status === 'HOME未送信'
                  ? !st.sent
                  : !st.registered)) &&
          (difficulty === 'すべて' || r?.difficulty === Number(difficulty)) &&
          (myth === 'すべて' ||
            (routes[p.id] ?? []).some((r) => r.status === myth)) &&
          (extra === 'すべて' ||
            (extra === 'Bank移送推奨' && priority(p, s) > 0) ||
            (extra === '固定シンボル' && r?.fixed) ||
            (extra === '通信必要' && r?.trade) ||
            (extra === 'DLC必須（収録ルート）' &&
              (routes[p.id] ?? []).length > 0 &&
              (routes[p.id] ?? []).every((r) => !!r.dlc)) ||
            (extra === '入手ルート未確認' && !routes[p.id]?.length) ||
            (extra === '現在入手不可（収録ルート）' &&
              (routes[p.id]?.length ?? 0) > 0 &&
              routes[p.id].every((r) =>
                ['event', 'unavailable'].includes(r.method),
              )))
        );
      }),
    [q, view, s, category, gen, type, status, extra, difficulty, myth],
  );
  const pages = Math.max(1, Math.ceil(result.length / 24));
  const current = Math.min(page, pages),
    shown = result.slice((current - 1) * 24, current * 24);
  const plan = useMemo(() => optimize(s), [s]);
  const title = id
    ? pokemon.find((p) => p.id === id)?.name
    : (navs.find((n) => n[0] === (view === 'dex' ? '/' : '/' + view))?.[1] ??
      '全国図鑑');
  const toggleOwned = (key: 'owned' | 'dlc', game: string, b: boolean) =>
    setS((old) => ({
      ...old,
      [key]: b ? [...old[key], game] : old[key].filter((g) => g !== game),
    }));
  function checks(p: Pokemon, full = false) {
    const st = s.progress[p.id] ?? {};
    return (
      <div className={'checks ' + (full ? 'full' : '')}>
        <Flag checked={!!st.caught} onChange={(b) => update(p.id, 'caught', b)}>
          捕獲済み
        </Flag>
        <Flag checked={!!st.sent} onChange={(b) => update(p.id, 'sent', b)}>
          HOME送信
        </Flag>
        <Flag
          checked={!!st.registered}
          onChange={(b) => update(p.id, 'registered', b)}
        >
          図鑑登録
        </Flag>
        {full && (
          <Flag
            checked={!!st.living}
            onChange={(b) => update(p.id, 'living', b)}
          >
            Living Dexに保管
          </Flag>
        )}
      </div>
    );
  }
  function badges(p: Pokemon) {
    return (
      <div className="badges">
        {p.types.map((t) => (
          <span className={'type ' + (colors[t] ?? 'normal')} key={t}>
            {t}
          </span>
        ))}
        {p.category !== '通常' && (
          <span className="category">{p.category}</span>
        )}
      </div>
    );
  }
  function card(p: Pokemon) {
    const r = recommend(p, s),
      pr = priority(p, s);
    return (
      <article
        className={
          'pokemon-card ' + (s.progress[p.id]?.caught ? 'is-caught' : '')
        }
        key={p.id}
      >
        <div className="card-top">
          <span className="dex-no">No. {String(p.id).padStart(4, '0')}</span>
          <span className="generation">第{p.gen}世代</span>
        </div>
        <Link href={'/pokemon/' + p.id} className="pokemon-link">
          <Pic p={p} />
          <h2>
            {p.name}
            <ChevronRight size={17} />
          </h2>
        </Link>
        {badges(p)}
        <div className="recommend">
          <span className="recommend-label">
            {r ? (
              <>
                <Target size={12} /> あなたへのおすすめ
              </>
            ) : (
              '入手方法を確認'
            )}
          </span>
          <b>
            {r
              ? r.game
              : routes[p.id]?.length
                ? '所持ソフトでのルートなし'
                : '入手ルート未確認'}
          </b>
          <p>
            {r ? labels[r.method] : '詳細・所持ソフトを確認'}
            {r?.dlc && <span className="mini-tag">DLC</span>}
            {r?.trade && <span className="mini-tag">通信</span>}
          </p>
          <Stars n={r?.difficulty} />
        </div>
        {pr > 0 && (
          <div className="bank-tag">
            <ShieldAlert size={12} />
            {pr === 2 ? 'Bank終了前に送るべき' : '旧作ルートあり・移送を検討'}
          </div>
        )}
        {checks(p)}
      </article>
    );
  }
  const normalPages =
    ['dex', 'missing', 'legends', 'bank'].includes(view) && !id;
  return (
    <SidebarProvider>
      <div className="shell">
        <aside>
          <Link href="/" className="brand">
            <BookOpen size={25} />
            DEX COMPASS
          </Link>
          <p className="eyebrow">POKÉMON HOME COMPANION</p>
          <nav aria-label="メインナビゲーション">
            <SidebarMenu>
              {navs.map(([url, label, Icon]) => (
                <SidebarMenuItem key={url}>
                  <SidebarMenuButton
                    className={
                      (url === '/' && view === 'dex') || url === '/' + view
                        ? 'active'
                        : ''
                    }
                    render={<Link href={url} />}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                    {url === '/missing' && <em>{1025 - caught}</em>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
          <div className="aside-bottom">
            <div className="sidebar-progress">
              <span>コンプリートまで</span>
              <b>{((registered / 1025) * 100).toFixed(1)}%</b>
              <ProgressBar value={(registered / 1025) * 100} />
            </div>
            あなたの図鑑を、一匹ずつ。
            <br />
            非公式ファンメイドツール
          </div>
        </aside>
        <main>
          <header>
            <span>
              ワークスペース <span className="separator">/</span> {title}
            </span>
            <span>
              {error
                ? '保存エラー'
                : loaded
                  ? '● このブラウザに自動保存'
                  : '保存データを確認中'}
            </span>
          </header>
          <section>
            {error && (
              <div role="alert" className="notice">
                {error}
              </div>
            )}
            <div className="heading">
              <div>
                <p className="eyebrow">YOUR COLLECTION, YOUR JOURNEY</p>
                <h1>{title}</h1>
                <p>
                  {view === 'dex'
                    ? '次の一匹を、いちばん集めやすい作品で。'
                    : view === 'settings'
                      ? '持っているソフトから、あなたに合ったルートを。'
                      : view === 'routes'
                        ? 'おすすめの入手先を作品ごとにまとめました。'
                        : view === 'living'
                          ? '図鑑登録とは別に、各種の個体を手元に保管。'
                          : '集める・送る・登録する。次にやることを見つけよう。'}
                </p>
              </div>
              {!id && view !== 'settings' && (
                <Link className="primary button-link" href="/routes">
                  <RouteIcon size={17} />
                  残りポケモンを最短で集める
                  <ArrowRight size={16} />
                </Link>
              )}
            </div>
            {normalPages && (
              <>
                <div className="stats">
                  <article>
                    <div className="stat-label">
                      <span>全国図鑑の登録状況</span>
                      <BookOpen size={18} />
                    </div>
                    <strong>
                      {registered.toLocaleString()} <small>/ 1,025</small>
                    </strong>
                    <ProgressBar value={(registered / 1025) * 100} />
                    <p>全国図鑑コンプリートまで あと{1025 - registered}匹</p>
                  </article>
                  <article>
                    <div className="stat-label">
                      <span>あと集めるポケモン</span>
                      <Package size={18} />
                    </div>
                    <strong>
                      {(1025 - caught).toLocaleString()} <small>匹</small>
                    </strong>
                    <p>
                      <span className="green-dot" />
                      捕獲済み {caught}匹
                    </p>
                  </article>
                  <article>
                    <div className="stat-label">
                      <span>HOME送信済み</span>
                      <Cloud size={18} />
                    </div>
                    <strong>
                      {sent.toLocaleString()} <small>匹</small>
                    </strong>
                    <p>
                      送信待ち{' '}
                      {
                        pokemon.filter(
                          (p) =>
                            s.progress[p.id]?.caught && !s.progress[p.id]?.sent,
                        ).length
                      }
                      匹
                    </p>
                  </article>
                </div>
                <Link href="/bank" className="notice">
                  <ShieldAlert size={23} />
                  <div>
                    <b>Pokémon Bank 終了に備えましょう</b>
                    <p>
                      2027年2月26日 12:00 終了予定。大切な個体は早めにHOMEへ。
                    </p>
                  </div>
                  <ArrowRight size={18} className="ml-auto" />
                </Link>
              </>
            )}
            {view === 'settings' && !id && (
              <>
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>所持ソフト</h2>
                      <p>
                        初期設定はご指定の主要ソフトです。実際の所持状況に合わせて変更してください。
                      </p>
                    </div>
                    <span className="badge">{s.owned.length}作品</span>
                  </div>
                  <div className="games-grid">
                    {games.map((g) => (
                      <div
                        className={
                          'game-option ' +
                          (s.owned.includes(g) ? 'selected' : '')
                        }
                        key={g}
                      >
                        <Gamepad2 size={20} />
                        <Flag
                          checked={s.owned.includes(g)}
                          onChange={(b) => toggleOwned('owned', g, b)}
                        >
                          {g}
                        </Flag>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="panel">
                  <h2>追加コンテンツ（DLC）</h2>
                  <p>
                    本編とDLCの両方を選択した場合だけ、DLCの入手ルートをおすすめします。
                  </p>
                  <div className="games-grid">
                    {dlcs.map((g) => (
                      <div className="game-option" key={g}>
                        <Flag
                          checked={s.dlc.includes(g)}
                          onChange={(b) => toggleOwned('dlc', g, b)}
                        >
                          {g}
                        </Flag>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>固定シンボルを優先</h2>
                      <p>
                        固定 → ストーリー → NPC → 野生 → 進化 → 通信 → 特殊 →
                        ランダムの順に比較。
                      </p>
                    </div>
                    <Switch
                      id="fixed-mode"
                      checked={s.fixed}
                      onCheckedChange={(fixed) => setS({ ...s, fixed })}
                      aria-label="固定シンボルを優先"
                    />
                  </div>
                  <p>
                    OFFでは難易度を優先します。★評価は当サイトの目安で、ストーリーやDLCの進行時間も含みます。
                  </p>
                </article>
                <article className="panel">
                  <h2>データについて</h2>
                  <p>
                    全国1,025種の基本情報を収録。入手方法は順次確認中で、全作品の全ルートを網羅していません。未収録は入手不可を意味しません。
                  </p>
                  <p>
                    Pokémon
                    GOのイベント開催状況は都度公式情報を確認してください。現在の開催を未確認の配布は、おすすめ計算から除外します。
                  </p>
                  <p>
                    保存先はこのブラウザのlocalStorageです。データ削除・別端末には引き継がれません。
                  </p>
                  <a
                    className="source"
                    href="https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv"
                    target="_blank"
                    rel="noreferrer"
                  >
                    基本データ：PokeAPI <ExternalLink size={13} />
                  </a>
                </article>
              </>
            )}
            {view === 'bank' && !id && (
              <>
                <div className="bank-panels">
                  <article className="panel">
                    <span className="badge danger">最優先</span>
                    <h2>取り戻せない個体を守る</h2>
                    <p>
                      過去配布・色違い・特殊リボンなど、同じ個体を再入手できないもの。詳細画面の「大切な旧作個体」で印を付けられます。
                    </p>
                  </article>
                  <article className="panel">
                    <span className="badge amber">優先度 高</span>
                    <h2>旧作の入手ルートを確認</h2>
                    <p>
                      3DSで集めやすい種やUBを検討。UBには冠の雪原の代替手段があります。旧作しかデータがない種はSwitch側も要確認。
                    </p>
                  </article>
                  <article className="panel">
                    <span className="badge">後回しを検討</span>
                    <h2>Switchで再入手できる種</h2>
                    <p>
                      種として再入手が容易でも、思い出の個体や過去作フォルムは別に判断してください。
                    </p>
                  </article>
                </div>
                <article className="panel">
                  <h2>移送の手順</h2>
                  <p>
                    BW系 → ポケムーバー → Bank → HOME。X・SM・USUM → Bank →
                    HOME。HOMEプレミアムプランと、ダウンロード済みの旧ソフトが必要です。HOMEからBankには戻せません。
                  </p>
                  <a
                    href={bankSource}
                    target="_blank"
                    rel="noreferrer"
                    className="source"
                  >
                    公式の終了告知を確認 <ExternalLink size={13} />
                  </a>
                </article>
              </>
            )}
            {view === 'missing' && !id && (
              <article className="panel">
                <h2>残りの内訳</h2>
                <div className="remaining-grid">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div key={i}>
                      第{i + 1}世代{' '}
                      <b>
                        {
                          pokemon.filter(
                            (p) => p.gen === i + 1 && !s.progress[p.id]?.caught,
                          ).length
                        }
                        匹
                      </b>
                    </div>
                  ))}
                  {['通常', '準伝説', '伝説', '幻', 'ウルトラビースト'].map(
                    (c) => (
                      <div key={c}>
                        {c}
                        <b>
                          {
                            pokemon.filter(
                              (p) =>
                                p.category === c && !s.progress[p.id]?.caught,
                            ).length
                          }
                          匹
                        </b>
                      </div>
                    ),
                  )}
                </div>
              </article>
            )}
            {view === 'routes' && !id && (
              <>
                <div className="notice info">
                  <Target />
                  <div>
                    <b>所持ソフト内の収録済みルートを比較</b>
                    <p>
                      固定優先：{s.fixed ? 'ON' : 'OFF'}
                      。ゲームごとにまとめることで切り替えを減らします。進行状況や実測時間を含む厳密な最短経路ではありません。
                    </p>
                  </div>
                </div>
                {Object.entries(plan.groups).map(([game, entries]) => (
                  <article className="panel" key={game}>
                    <div className="panel-heading">
                      <h2>
                        <Gamepad2 size={20} /> Pokémon {game}
                      </h2>
                      <span className="badge">{entries.length}匹</span>
                    </div>
                    <div className="route-list">
                      {entries.map(({ p, r }) => (
                        <div key={p.id}>
                          <Flag
                            checked={!!s.progress[p.id]?.caught}
                            onChange={(b) => update(p.id, 'caught', b)}
                          >
                            <Link href={'/pokemon/' + p.id}>
                              #{p.id} {p.name}
                            </Link>
                          </Flag>
                          <span>{labels[r.method]}</span>
                          <Stars n={r.difficulty} />
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
                {!Object.keys(plan.groups).length && (
                  <article className="panel">
                    未所持ポケモンに対するおすすめルートがありません。所持ソフト設定または収集状況を確認してください。
                  </article>
                )}
                <article className="panel">
                  <h2>別途確認が必要：{plan.unresolved.length}匹</h2>
                  <p>
                    ルート未収録・ソフト未所持・過去配布などを含みます。自動計算から除外し、未所持として残しています。
                  </p>
                  <div className="link-cloud">
                    {plan.unresolved.map((p) => (
                      <Link key={p.id} href={'/pokemon/' + p.id}>
                        {p.name}
                      </Link>
                    ))}
                  </div>
                </article>
              </>
            )}
            {id &&
              (() => {
                const p = pokemon.find((p) => p.id === id);
                if (!p)
                  return (
                    <article className="panel">
                      該当するポケモンが見つかりません。
                      <Link href="/">全国図鑑に戻る</Link>
                    </article>
                  );
                const r = recommend(p, s),
                  all = [...(routes[p.id] ?? [])].sort(
                    (a, b) =>
                      Number(available(b, s)) - Number(available(a, s)) ||
                      score(a, s) - score(b, s),
                  );
                return (
                  <>
                    <Link className="back-link" href="/">
                      <ChevronLeft size={16} />
                      全国図鑑に戻る
                    </Link>
                    <article className="panel detail-hero">
                      <Pic p={p} />
                      <div>
                        <span className="dex-no">
                          No. {String(p.id).padStart(4, '0')} · 第{p.gen}世代
                        </span>
                        <h2>
                          {p.name} <small>{p.en}</small>
                        </h2>
                        {badges(p)}
                        {checks(p, true)}
                        <Flag
                          checked={!!s.progress[p.id]?.preserve}
                          onChange={(b) => update(p.id, 'preserve', b)}
                        >
                          大切な旧作個体（配布・色違い・リボンなど）をBank終了前に送る
                        </Flag>
                      </div>
                    </article>
                    <article className="panel recommendation-detail">
                      <span className="recommend-label">
                        <Target size={14} /> あなたの環境でおすすめ
                      </span>
                      <h2>{r ? r.game : '所持ソフト内の入手ルートは未確認'}</h2>
                      <p>
                        {r?.text ??
                          '未収録の作品や配布状況を出典で確認してください。入手不可を意味するものではありません。'}
                      </p>
                      <Stars n={r?.difficulty} />
                      {r && (
                        <p className="reason">
                          理由：
                          {s.fixed
                            ? `${labels[r.method]}を優先し、`
                            : '難易度を優先し、'}
                          所持ソフトとDLC条件を満たす収録ルートから選択。
                        </p>
                      )}
                    </article>
                    <article className="panel">
                      <h2>作品ごとの入手方法</h2>
                      <p>
                        所持ソフトで条件を満たすルートを上に表示。未掲載の作品は「未確認」です。
                      </p>
                      {all.length ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {[
                                '作品',
                                '入手可能',
                                '方法・条件',
                                '固定',
                                '通信必要',
                                '難易度',
                                '根拠',
                              ].map((h) => (
                                <TableHead key={h}>{h}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {all.map((a, i) => (
                              <TableRow key={i}>
                                <TableCell>
                                  <b>{a.game}</b>
                                  {s.owned.includes(a.game) && (
                                    <span className="mini-tag">所持</span>
                                  )}
                                  {a.dlc && <p className="muted">{a.dlc}</p>}
                                </TableCell>
                                <TableCell>
                                  {a.needsReview
                                    ? '条件を要確認'
                                    : a.method === 'event'
                                      ? '過去配布のみ'
                                      : '○'}
                                  {a.status && (
                                    <p className="muted">{a.status}</p>
                                  )}
                                </TableCell>
                                <TableCell className="method-cell">
                                  {a.text}
                                </TableCell>
                                <TableCell>{a.fixed ? '○' : '×'}</TableCell>
                                <TableCell>{a.trade ? '○' : '×'}</TableCell>
                                <TableCell>
                                  <Stars n={a.difficulty} />
                                </TableCell>
                                <TableCell>
                                  <a
                                    className="source"
                                    href={a.source}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    出典
                                    <ExternalLink size={13} />
                                  </a>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p>入手情報の確認待ちです。</p>
                      )}
                    </article>
                    <article className="panel">
                      <h2>HOMEへの移送</h2>
                      <p>
                        {r?.bank
                          ? 'このおすすめルートはBankを経由します。2027年2月26日12:00までにHOMEへ移送してください。'
                          : '本編の対応作品からHOMEへ移送できます。特殊な個体・フォルムは制限を確認してください。'}
                      </p>
                      <p>
                        Z-Aに一度連れていった個体は、過去の対応作品に戻せません。GO産には本編への引き出し制限がある場合があります。
                      </p>
                      <a
                        className="source"
                        href="https://www.pokemon.co.jp/ex/pokemonhome/ja/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        HOME公式の対応情報 <ExternalLink size={13} />
                      </a>
                    </article>
                    <article className="panel">
                      <h2>進化系統</h2>
                      <div className="evolution">
                        {pokemon
                          .filter((x) => x.chain === p.chain)
                          .map((x) => (
                            <Link href={'/pokemon/' + x.id} key={x.id}>
                              <Pic p={x} />
                              <b>{x.name}</b>
                              {x.parent > 0 && (
                                <small>
                                  {pokemon[x.parent - 1]?.name}から進化
                                </small>
                              )}
                            </Link>
                          ))}
                      </div>
                      <p>進化条件（作品・フォルムによって条件が異なります）</p>
                      {(evolutions[p.id] ?? []).map((e, i) => (
                        <p className="evo-condition" key={i}>
                          <b>{e.gameGroup}</b>：{e.text}
                        </p>
                      ))}
                      {!evolutions[p.id]?.length && (
                        <p>この種へ進化する条件のデータはありません。</p>
                      )}
                      <a
                        className="source"
                        href="https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_evolution.csv"
                        target="_blank"
                        rel="noreferrer"
                      >
                        進化条件の出典 <ExternalLink size={13} />
                      </a>
                    </article>
                    <article className="panel">
                      <h2>フォルム管理</h2>
                      <p>
                        種の図鑑登録とは独立した所持チェックです。一時的な戦闘中フォルムは除外しています。HOME保管可能なフォルムの完全な一覧ではありません。
                      </p>
                      <div className="games-grid">
                        {['通常の姿', ...p.forms].map((form) => (
                          <Flag
                            key={form}
                            checked={!!s.progress[p.id]?.forms?.[form]}
                            onChange={(b) =>
                              setS((old) => ({
                                ...old,
                                progress: {
                                  ...old.progress,
                                  [p.id]: {
                                    ...old.progress[p.id],
                                    forms: {
                                      ...old.progress[p.id]?.forms,
                                      [form]: b,
                                    },
                                  },
                                },
                              }))
                            }
                          >
                            {form}
                          </Flag>
                        ))}
                      </div>
                    </article>
                  </>
                );
              })()}
            {(normalPages || (view === 'living' && !id)) && (
              <>
                <div className="collection-controls">
                  <div className="collection-tabs">
                    <button
                      className={status === 'すべて' ? 'selected-tab' : ''}
                      onClick={() => setStatus('すべて')}
                    >
                      すべてのポケモン{' '}
                      <span>
                        {view === 'legends'
                          ? pokemon.filter((p) => p.category !== '通常').length
                          : 1025}
                      </span>
                    </button>
                    <button
                      className={status === '未所持' ? 'selected-tab' : ''}
                      onClick={() => setStatus('未所持')}
                    >
                      未所持 <span>{1025 - caught}</span>
                    </button>
                    <button
                      className={status === '捕獲済み' ? 'selected-tab' : ''}
                      onClick={() => setStatus('捕獲済み')}
                    >
                      捕獲済み <span>{caught}</span>
                    </button>
                  </div>
                  <label className="fixed-toggle" htmlFor="fixed-mode">
                    <Switch
                      id="fixed-mode"
                      checked={s.fixed}
                      onCheckedChange={(fixed) => setS({ ...s, fixed })}
                    />
                    固定シンボル優先
                  </label>
                </div>
                <div className="filter-panel">
                  <div className="search-row">
                    <div className="toolbar">
                      <Search size={19} />
                      <input
                        aria-label="ポケモン検索"
                        placeholder="ポケモン名・全国図鑑No.で検索"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                      />
                      {q && (
                        <button
                          className="clear"
                          onClick={() => setQ('')}
                          aria-label="検索をクリア"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => setAdvanced(!advanced)}
                      aria-expanded={advanced}
                    >
                      <SlidersHorizontal size={16} />
                      詳細フィルター
                    </button>
                  </div>
                  <div className="filter-row">
                    <Choice
                      label="世代"
                      value={gen}
                      onChange={setGen}
                      items={[
                        'すべて',
                        ...Array.from(
                          { length: 9 },
                          (_, i) => `第${i + 1}世代`,
                        ),
                      ]}
                    />
                    <Choice
                      label="タイプ"
                      value={type}
                      onChange={setType}
                      items={[
                        'すべて',
                        ...new Set(pokemon.flatMap((p) => p.types)),
                      ]}
                    />
                    <Choice
                      label="分類"
                      value={category}
                      onChange={setCategory}
                      items={[
                        'すべて',
                        '通常',
                        '準伝説',
                        '伝説',
                        '幻',
                        'ウルトラビースト',
                      ]}
                    />
                    <button
                      className={
                        extra === 'Bank移送推奨' ? 'filter-active' : ''
                      }
                      onClick={() =>
                        setExtra(
                          extra === 'Bank移送推奨' ? 'すべて' : 'Bank移送推奨',
                        )
                      }
                    >
                      <ShieldAlert size={14} />
                      Bank移送推奨
                    </button>
                    <Link href="/settings" className="owned-link">
                      <Gamepad2 size={15} />
                      所持ソフト {s.owned.length}作品
                      <ChevronRight size={13} />
                    </Link>
                  </div>
                  {advanced && (
                    <div className="filter-row advanced">
                      <Choice
                        label="所持・登録状況"
                        value={status}
                        onChange={setStatus}
                        items={[
                          'すべて',
                          '未所持',
                          '捕獲済み',
                          'HOME未送信',
                          '図鑑未登録',
                        ]}
                      />
                      <Choice
                        label="入手条件"
                        value={extra}
                        onChange={setExtra}
                        items={[
                          'すべて',
                          'Bank移送推奨',
                          '固定シンボル',
                          '通信必要',
                          'DLC必須（収録ルート）',
                          '現在入手不可（収録ルート）',
                          '入手ルート未確認',
                        ]}
                      />
                      <Choice
                        label="難易度"
                        value={difficulty}
                        onChange={setDifficulty}
                        items={['すべて', '1', '2', '3', '4', '5']}
                      />
                      <button
                        onClick={() => {
                          setQ('');
                          setCategory('すべて');
                          setGen('すべて');
                          setType('すべて');
                          setStatus('すべて');
                          setExtra('すべて');
                          setDifficulty('すべて');
                          setMyth('すべて');
                        }}
                      >
                        絞り込みをリセット
                      </button>
                    </div>
                  )}
                  {view === 'legends' && (
                    <div className="filter-row advanced">
                      <Choice
                        label="幻の入手状況"
                        value={myth}
                        onChange={setMyth}
                        items={[
                          'すべて',
                          '恒常入手可能',
                          'DLCで入手可能',
                          'GOで入手可能',
                          '過去配布のみ',
                          '現在入手困難',
                        ]}
                      />
                      <span className="muted">
                        追加条件未確認の候補は自動おすすめから除外
                      </span>
                    </div>
                  )}
                </div>
                <div className="results-heading">
                  <span>
                    <b>{result.length.toLocaleString()}</b>匹{' '}
                    {q && `「${q}」の検索結果`}
                  </span>
                  <div>
                    <span className="muted">全国図鑑No.順</span>
                    <div className="view-toggle">
                      <button
                        aria-label="カード表示"
                        aria-pressed={layout === 'grid'}
                        className={layout === 'grid' ? 'chosen' : ''}
                        onClick={() => setLayout('grid')}
                      >
                        <Grid2X2 size={16} />
                      </button>
                      <button
                        aria-label="表表示"
                        aria-pressed={layout === 'table'}
                        className={layout === 'table' ? 'chosen' : ''}
                        onClick={() => setLayout('table')}
                      >
                        <List size={17} />
                      </button>
                    </div>
                  </div>
                </div>
                <p className="data-note">
                  入手ルートは確認・拡充中。おすすめは収録済みルート内の比較です。旧作限定の断定には使わないでください。
                </p>
                {view === 'living' ? (
                  <article className="panel">
                    <h2>保管済み {count('living')} / 1,025</h2>
                    <div className="living-grid">
                      {shown.map((p) => (
                        <div key={p.id}>
                          <Link href={'/pokemon/' + p.id}>
                            <Pic p={p} />
                            <b>{p.name}</b>
                          </Link>
                          <Flag
                            checked={!!s.progress[p.id]?.living}
                            onChange={(b) => update(p.id, 'living', b)}
                          >
                            保管済み
                          </Flag>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : (
                  <>
                    <div
                      className={
                        'pokemon-grid ' +
                        (layout === 'table' ? 'mobile-only' : '')
                      }
                    >
                      {shown.map(card)}
                    </div>
                    {layout === 'table' && (
                      <div className="desktop-table">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {[
                                'No.',
                                'ポケモン',
                                'タイプ・分類',
                                'おすすめ作品',
                                '入手方法',
                                '難易度',
                                '収集状況',
                              ].map((x) => (
                                <TableHead key={x}>{x}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {shown.map((p) => {
                              const r = recommend(p, s);
                              return (
                                <TableRow
                                  key={p.id}
                                  className={
                                    s.progress[p.id]?.caught ? 'is-caught' : ''
                                  }
                                >
                                  <TableCell className="dex-no">
                                    {String(p.id).padStart(4, '0')}
                                  </TableCell>
                                  <TableCell>
                                    <Link
                                      className="table-pokemon"
                                      href={'/pokemon/' + p.id}
                                    >
                                      <Pic p={p} />
                                      <b>{p.name}</b>
                                    </Link>
                                  </TableCell>
                                  <TableCell>
                                    {badges(p)}
                                    <span className="muted">
                                      第{p.gen}世代{' '}
                                      {priority(p, s) > 0
                                        ? '⚠ Bank移送を検討'
                                        : ''}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    {r?.game ?? '要確認'}
                                    {r?.dlc && (
                                      <span className="mini-tag">DLC</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {r ? labels[r.method] : '未確認'}
                                  </TableCell>
                                  <TableCell>
                                    <Stars n={r?.difficulty} />
                                  </TableCell>
                                  <TableCell>{checks(p)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
                {result.length === 0 && (
                  <div className="empty-result">
                    <Search size={32} />
                    <h2>条件に一致するポケモンがいません</h2>
                    <p>検索語またはフィルターを変更してください。</p>
                  </div>
                )}
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <button
                        disabled={current === 1}
                        onClick={() => setPage(current - 1)}
                        aria-label="前のページ"
                      >
                        <ChevronLeft size={16} />
                      </button>
                    </PaginationItem>
                    <PaginationItem>
                      <span>
                        {current} / {pages} ページ
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <button
                        disabled={current === pages}
                        onClick={() => setPage(current + 1)}
                        aria-label="次のページ"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </>
            )}
            <footer>
              <span>DEX COMPASS · 非公式の全国図鑑管理ツール</span>
              <span>
                情報確認日：2026.09.08 ·{' '}
                <Link href="/settings">データ・出典について</Link>
              </span>
              <p>
                Pokémon © Nintendo / Creatures / GAME FREAK.
                基本情報・画像：PokeAPI。入手情報：各詳細の出典。準伝説は本サイトの便宜的な分類です。
              </p>
            </footer>
          </section>
        </main>
      </div>
    </SidebarProvider>
  );
}
