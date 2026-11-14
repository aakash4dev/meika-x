// Number formatting shared by agents, ledger and UI. One formatter, so ledger strings and prose match.
import { sig } from "./stats/basic";

export function fmt(x: number | null | undefined, s = 3): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  const v = sig(x, s);
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  return String(v);
}

export function fmtSigned(x: number, s = 3): string {
  const f = fmt(x, s);
  return x > 0 && f !== "n/a" ? `+${f}` : f;
}

export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return "n/a";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
