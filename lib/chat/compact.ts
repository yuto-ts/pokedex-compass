// Compaction rules for the documents the chat reads (docs/chat-sidebar.md §6.5).
// The model reads these files on every question that touches the collection,
// so their size is a per-question cost. The rule ids (R1…) are the ones the
// design document uses.
// Kept free of browser APIs so scripts/check-engine.mjs can load it.

/** Bytes a snapshot document may take. Checked by scripts/check-engine.mjs. */
export const SNAPSHOT_BUDGET = 8000;

/** R2 連番の畳み込み: [1, 2, 3, 7, 10, 11] → "1-3, 7, 10-11" */
export function ranges(ids: number[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let end = i;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1)
      end++;
    out.push(end > i ? `${sorted[i]}-${sorted[end]}` : `${sorted[i]}`);
    i = end + 1;
  }
  return out.join(', ');
}

/**
 * R1 省略 + R3 反転。既定値（記録なし）は書かず、対象が母集合の半分を超えたら
 * 補集合で書きます。`universe` は母集合の id をすべて含みます。
 */
export function membership(
  label: string,
  ids: number[],
  universe: number[],
): string {
  const has = new Set(ids);
  const total = universe.length;
  if (!has.size) return `- ${label}: なし`;
  if (has.size === total) return `- ${label}: 全 ${total} 種`;
  if (has.size * 2 <= total)
    return `- ${label}（${has.size}匹）: ${ranges([...has])}`;
  const rest = universe.filter((id) => !has.has(id));
  return `- ${label}（${has.size}匹）: No.${ranges(rest)} 以外のすべて`;
}

/** R4 同じ属性のまとめ: 見出しが同じ項目の id を 1 行分に集めます。 */
export function groupIds<T>(
  items: T[],
  key: (item: T) => string,
  id: (item: T) => number,
): [string, number[]][] {
  const groups = new Map<string, number[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), id(item)]);
  }
  // Biggest group first: the reader scans the common cases before the rest.
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}
