// Cross-checks the trend engine against scipy and pymannkendall outputs (tests/fixtures/reference.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mannKendall, ols, senSlope, yearsNeeded, pettitt, toPoint } from "../src/lib/stats/trend";
import { benjaminiHochberg } from "../src/lib/stats/fdr";
import { tCdf, tInv, normalCdf } from "../src/lib/stats/basic";

interface Ref {
  t: number[]; y: number[]; ols_slope: number; ols_p_plain: number; mk_p_hr: number; mk_z_hr: number;
  mk_p: number; mk_s: number; sen: number; tau: number;
}
const refs: Ref[] = JSON.parse(readFileSync(new URL("./fixtures/reference.json", import.meta.url), "utf8"));
const close = (a: number, b: number, rel = 0.01, abs = 1e-4) => assert.ok(Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)), `${a} vs ${b}`);

test("distributions", () => {
  close(normalCdf(1.96), 0.975, 1e-4);
  close(tCdf(2.228, 10), 0.975, 1e-3);
  close(tInv(0.975, 10), 2.228, 1e-3);
});

for (const [i, r] of refs.entries()) {
  test(`case ${i}: OLS slope and plain p match scipy.linregress`, () => {
    const f = ols(r.t, r.y);
    close(f.slopePerYear, r.ols_slope, 1e-6);
    close(f.plainP, r.ols_p_plain, 0.02, 1e-6);
    assert.ok(f.p >= f.plainP, "autocorrelation adjustment should not make p smaller for positive r1");
  });
  test(`case ${i}: Sen and Mann-Kendall match pymannkendall`, () => {
    close(senSlope(r.t, r.y), r.sen, 1e-6);
    const m = mannKendall(r.t, r.y);
    assert.equal(m.S, r.mk_s);
    close(m.tau, r.tau, 1e-6);
    close(m.plainP, r.mk_p, 0.02, 1e-6);
    close(m.z, r.mk_z_hr, 0.03);
    close(m.p, r.mk_p_hr, 0.05, 1e-6);
  });
}

test("Benjamini-Hochberg", () => {
  const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.2]);
  close(q[0], 0.04, 1e-9);
  close(q[1], 0.0533333, 1e-4);
  close(q[2], 0.0533333, 1e-4);
  close(q[3], 0.2, 1e-9);
});

test("years needed grows as the trend shrinks", () => {
  assert.ok(yearsNeeded(0.5, 0.01, 0.3) > yearsNeeded(0.5, 0.05, 0.3));
});

test("Pettitt finds an obvious step", () => {
  const y = Array.from({ length: 120 }, (_, i) => (i < 60 ? 0 : 1) + Math.sin(i) * 0.05);
  const pts = y.map((v, i) => toPoint(2000 + Math.floor(i / 12), (i % 12) + 1, v));
  const p = pettitt(pts, y);
  assert.ok(Math.abs(p.index - 59) <= 1);
  assert.ok(p.p < 0.001);
});
