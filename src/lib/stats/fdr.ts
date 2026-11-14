/** Benjamini-Hochberg false discovery rate. Returns q-values in the input order. */
export function benjaminiHochberg(pvals: number[]): number[] {
  const m = pvals.length;
  const order = pvals.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    prev = Math.min(prev, (p * m) / (k + 1));
    q[i] = prev;
  }
  return q;
}
