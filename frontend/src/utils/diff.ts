/**
 * Minimal line diff for the snippet revision history.
 *
 * Longest-common-subsequence over lines. It is O(n*m), which is fine for code
 * snippets but would be reckless for a large file, so anything beyond the cell
 * budget falls back to a whole-file replace rather than risking a frozen tab.
 */
export type DiffType = 'same' | 'add' | 'del';

export interface DiffRow {
  type: DiffType;
  text: string;
}

const MAX_CELLS = 250_000;

export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split('\n');
  const b = after.split('\n');

  if (a.length * b.length > MAX_CELLS) {
    return [
      { type: 'del', text: `(${a.length} lines removed)` },
      { type: 'add', text: `(${b.length} lines added)` },
    ];
  }

  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      rows.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    rows.push({ type: 'del', text: a[i] });
    i += 1;
  }
  while (j < m) {
    rows.push({ type: 'add', text: b[j] });
    j += 1;
  }
  return rows;
}

export function diffStats(rows: DiffRow[]): { added: number; removed: number } {
  return rows.reduce(
    (acc, r) => {
      if (r.type === 'add') acc.added += 1;
      if (r.type === 'del') acc.removed += 1;
      return acc;
    },
    { added: 0, removed: 0 },
  );
}
