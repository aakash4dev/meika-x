"use client";

import { useEffect, useState } from "react";

interface Ping {
  ok: boolean;
  ms: number;
  status?: number;
  error?: string;
}
interface Status {
  nasa: { power: Ping; eonet: Ping; gibs: Ping; cmr: Ping; firms: string };
  ai: { provider: "api" | "cli" | "none"; model: string };
  telegram: boolean;
  database: { ok: boolean; ms: number; where: "local" | "cloud"; error?: string };
  scheduler: { intervalMin: number; startedAt: string } | null;
}

const P = ({ ok }: { ok: boolean }) => <span className={`pill ${ok ? "ok" : "alert"}`}>{ok ? "ok" : "down"}</span>;

export default function SystemStatus() {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then(setS)
      .catch(() => {});
  }, []);
  if (!s) return <div className="empty"><span className="spinner" /> Checking NASA services...</div>;
  const rows: [string, React.ReactNode, string][] = [
    ["NASA POWER API", <P key="p" ok={s.nasa.power.ok} />, `Monthly and daily MERRA-2 / CERES series, no key · ${s.nasa.power.ms} ms`],
    ["NASA EONET v3", <P key="e" ok={s.nasa.eonet.ok} />, `Natural events, no key · ${s.nasa.eonet.ms} ms`],
    ["NASA GIBS WMS", <P key="g" ok={s.nasa.gibs.ok} />, `Satellite imagery and Blue Marble, no key · ${s.nasa.gibs.ms} ms`],
    ["NASA CMR", <P key="c" ok={s.nasa.cmr.ok} />, `Dataset catalogue search, no key · ${s.nasa.cmr.ms} ms`],
    ["NASA FIRMS", <span key="f" className={`pill ${s.nasa.firms === "configured" ? "ok" : "na"}`}>{s.nasa.firms}</span>, "Active fires; set FIRMS_MAP_KEY"],
    [
      "Claude",
      <span key="a" className={`pill ${s.ai.provider === "none" ? "na" : "ai"}`}>{s.ai.provider === "api" ? "Anthropic API" : s.ai.provider === "cli" ? "local Claude Code" : "off"}</span>,
      `${s.ai.model} · planning, narration (English + local language), visual notes, alert digests. ${s.ai.provider === "none" ? "Set ANTHROPIC_API_KEY or install the claude CLI." : ""}`,
    ],
    [
      "Database",
      <P key="d" ok={s.database.ok} />,
      `Supabase (${s.database.where}): cases, reports, monitoring and satellite snapshots · ${s.database.ok ? `${s.database.ms} ms` : s.database.error ?? ""}`,
    ],
    ["Telegram", <span key="t" className={`pill ${s.telegram ? "ok" : "na"}`}>{s.telegram ? "configured" : "not set"}</span>, "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID"],
    [
      "Scheduler",
      <span key="s" className={`pill ${s.scheduler ? "ok" : "na"}`}>{s.scheduler ? `every ${s.scheduler.intervalMin} min` : "off"}</span>,
      "MONITOR_INTERVAL_MINUTES on a long-running server; on Vercel, Vercel Cron calls /api/monitor/run (vercel.json)",
    ],
  ];
  return (
    <div className="card">
      <table>
        <tbody>
          {rows.map(([name, pill, note]) => (
            <tr key={name}>
              <td style={{ width: 170, fontWeight: 600 }}>{name}</td>
              <td style={{ width: 150 }}>{pill}</td>
              <td className="small muted">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
