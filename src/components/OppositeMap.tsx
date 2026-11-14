"use client";

import type { MapResult } from "@/lib/agents/types";

function colorFor(v: number, max: number) {
  const t = Math.max(-1, Math.min(1, v / (max || 1)));
  if (t >= 0) return `rgb(${Math.round(210 + 30 * t)}, ${Math.round(120 - 80 * t)}, ${Math.round(110 - 70 * t)})`;
  return `rgb(${Math.round(90 + 40 * t)}, ${Math.round(140 + 20 * -t)}, ${Math.round(210 + 30 * -t)})`;
}

export default function OppositeMap({ map, units }: { map: MapResult; units: string }) {
  const max = Math.max(...map.cells.map((c) => Math.abs(c.slopeDecade)));
  const cells = [...map.cells];
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${map.cols}, 1fr)`,
          gap: 3,
          maxWidth: 360,
          aspectRatio: `${map.cols} / ${map.rows}`,
        }}
      >
        {Array.from({ length: map.rows })
          .map((_, r) => map.rows - 1 - r) // north at the top
          .flatMap((r) =>
            Array.from({ length: map.cols }).map((__, c) => {
              const cell = cells.find((x) => x.row === r && x.col === c);
              if (!cell) return <div key={`${r}-${c}`} style={{ background: "var(--panel-2)", borderRadius: 4 }} />;
              return (
                <div
                  key={`${r}-${c}`}
                  title={`${cell.lat.toFixed(2)}, ${cell.lon.toFixed(2)}: ${cell.slopeDecade.toFixed(3)} ${units}/decade, q=${cell.q.toFixed(3)}`}
                  style={{
                    background: colorFor(cell.slopeDecade, max),
                    opacity: cell.sig ? 1 : 0.25,
                    borderRadius: 4,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 10,
                    color: "#fff",
                    fontWeight: 700,
                    minHeight: 26,
                  }}
                >
                  {cell.sig ? (cell.slopeDecade > 0 ? "▲" : "▼") : ""}
                </div>
              );
            }),
          )}
      </div>
      <p className="small" style={{ marginTop: 10 }}>
        {map.opposite ? (
          <b style={{ color: "var(--accent)" }}>Opposite-story flag raised: the region average hides rises and falls.</b>
        ) : (
          <span className="muted">No opposite story: significant cells (if any) move the same way.</span>
        )}{" "}
        <span className="muted">
          {map.sigPos} rising, {map.sigNeg} falling, {map.cells.length - map.sigPos - map.sigNeg} not significant after FDR. North is up.
        </span>
      </p>
    </div>
  );
}
