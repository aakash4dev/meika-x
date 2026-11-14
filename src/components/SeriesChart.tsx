"use client";

import { useMemo, useState } from "react";
import type { SeriesForChart } from "@/lib/agents/types";

const W = 760;
const H = 300;
const P = { l: 46, r: 14, t: 14, b: 30 };

export default function SeriesChart({ s, units }: { s: SeriesForChart; units: string }) {
  const [mode, setMode] = useState<"anomaly" | "raw">("anomaly");
  const ys = mode === "anomaly" ? s.anomaly : s.raw;
  const geo = useMemo(() => {
    const vals = mode === "anomaly" ? [...ys, ...s.fitLo, ...s.fitHi] : ys;
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad;
    hi += pad;
    const n = ys.length;
    const x = (i: number) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r);
    const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const path = (arr: (number | null)[]) =>
      arr.reduce<string>((acc, v, i) => (v === null ? acc : acc + `${acc && arr[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");
    const yTicks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
    const years = s.ym.map((m) => Number(m.slice(0, 4)));
    const xTicks = years
      .map((yr, i) => ({ yr, i }))
      .filter((d, i) => s.ym[i].endsWith("-01") && d.yr % 5 === 0);
    const band =
      s.fitLo.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("") +
      s.fitHi
        .map((v, i) => [i, v] as const)
        .reverse()
        .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .join("") +
      "Z";
    return { x, y, path, yTicks, xTicks, band, lo, hi };
  }, [ys, s, mode]);

  return (
    <div>
      <div className="tabs">
        <button className={`tab ${mode === "anomaly" ? "on" : ""}`} onClick={() => setMode("anomaly")}>
          Deseasonalised + trend
        </button>
        <button className={`tab ${mode === "raw" ? "on" : ""}`} onClick={() => setMode("raw")}>
          Raw monthly values
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Time series chart">
        {geo.yTicks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={geo.y(v)} y2={geo.y(v)} className="chart-grid" />
            <text x={P.l - 6} y={geo.y(v) + 4} fontSize="10" textAnchor="end" className="chart-text">
              {Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)}
            </text>
          </g>
        ))}
        {geo.xTicks.map((t) => (
          <text key={t.i} x={geo.x(t.i)} y={H - 10} fontSize="10" textAnchor="middle" className="chart-text">
            {t.yr}
          </text>
        ))}
        {mode === "anomaly" && (
          <>
            <path d={geo.band} className="chart-band" />
            <line x1={P.l} x2={W - P.r} y1={geo.y(0)} y2={geo.y(0)} className="chart-zero" strokeDasharray="3 3" />
          </>
        )}
        <path d={geo.path(ys)} fill="none" className="chart-raw" strokeWidth={0.8} />
        {mode === "anomaly" && (
          <>
            <path d={geo.path(s.rolling)} fill="none" className="chart-mean" strokeWidth={1.8} />
            <path d={geo.path(s.fit)} fill="none" className="chart-trend" strokeWidth={2.6} />
          </>
        )}
        <text x={P.l} y={11} fontSize="10" className="chart-text">
          {mode === "anomaly" ? `anomaly (${units})` : units}
        </text>
      </svg>
      <div className="row tiny muted">
        <span>— grey: monthly</span>
        {mode === "anomaly" && (
          <>
            <span style={{ color: "var(--chart-mean)" }}>— 12-month mean</span>
            <span style={{ color: "var(--chart-trend)" }}>— linear trend with 95% band</span>
          </>
        )}
      </div>
    </div>
  );
}
