"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_REGION_ID, REGIONS } from "@/lib/catalog";
import type { EonetEvent } from "@/lib/nasa/eonet";
import type { Alert, WatchItem } from "@/lib/monitor/types";

interface MonitorData {
  watchlist: WatchItem[];
  alerts: Alert[];
  state: { lastRun?: string; lastTrigger?: string; runs: number; lastError?: string };
  running: boolean;
  scheduler: { intervalMin: number; startedAt: string } | null;
  telegram: boolean;
  firms: boolean;
}

const RULE_LABEL: Record<string, string> = { heat: "Heat", rain: "Heavy rain", dry: "Dry spell", events: "EONET events", fires: "FIRMS fires" };
const CAT_COLOR: Record<string, string> = {
  Wildfires: "#ff6a3d",
  "Severe Storms": "#8fc1ff",
  Volcanoes: "#ff3d6e",
  "Sea and Lake Ice": "#c7f0ff",
  Floods: "#3b8ed8",
  Earthquakes: "#f2b134",
  Landslides: "#b48a5a",
  Drought: "#e0b04b",
  "Dust and Haze": "#d8c39a",
  Snow: "#ffffff",
};

const pos = (lat: number, lon: number) => ({ left: `${((lon + 180) / 360) * 100}%`, top: `${((90 - lat) / 180) * 100}%` });

export default function MonitorDashboard() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [events, setEvents] = useState<EonetEvent[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", regionId: DEFAULT_REGION_ID, heat: true, rain: true, dry: true, events: true, fires: true, telegram: true, z: "2" });

  const load = useCallback(async () => {
    const res = await fetch("/api/monitor/watchlist", { cache: "no-store" });
    setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
    fetch("/api/events")
      .then((r) => r.json())
      .then((e) => Array.isArray(e) && setEvents(e))
      .catch(() => {});
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function runNow() {
    setBusy("run");
    setMsg("");
    try {
      const res = await fetch("/api/monitor/run", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMsg(d.skipped ? d.reason : `Run complete: ${d.alerts.length} new alert(s). Report ${d.reportId}.`);
    } catch (e) {
      setMsg(`Run failed: ${(e as Error).message}`);
    }
    setBusy("");
    void load();
  }

  async function testTelegram() {
    setBusy("tg");
    const res = await fetch("/api/telegram/test", { method: "POST" });
    const d = await res.json();
    setMsg(d.ok ? "Telegram test message sent." : `Telegram: ${d.error}`);
    setBusy("");
  }

  async function add() {
    setBusy("add");
    const body = {
      name: form.name,
      regionId: form.regionId,
      telegram: form.telegram,
      rules: {
        heat: { enabled: form.heat, z: Number(form.z) || 2 },
        rain: { enabled: form.rain, percentile: 0.99 },
        dry: { enabled: form.dry, percentile: 0.1 },
        events: { enabled: form.events },
        fires: { enabled: form.fires, min: 25 },
      },
    };
    const res = await fetch("/api/monitor/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    setMsg(res.ok ? `Watching ${d.name}. It will be checked on the next run.` : d.error);
    setBusy("");
    void load();
  }

  async function remove(id: string) {
    await fetch(`/api/monitor/watchlist?id=${id}`, { method: "DELETE" });
    void load();
  }

  if (!data) return <div className="empty"><span className="spinner" /> Loading monitor...</div>;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Active monitoring</h1>
          <div className="small muted">
            {data.scheduler ? `Automatic runs every ${data.scheduler.intervalMin} min` : "Automatic runs off (set MONITOR_INTERVAL_MINUTES)"} · last run{" "}
            {data.state.lastRun ? new Date(data.state.lastRun).toLocaleString() : "never"} ({data.state.lastTrigger ?? "n/a"}) · {data.state.runs} runs · Telegram{" "}
            {data.telegram ? "connected" : "not configured"} · FIRMS {data.firms ? "on" : "no key"}
          </div>
          {data.state.lastError && <div className="small" style={{ color: "var(--alert)" }}>Last error: {data.state.lastError}</div>}
        </div>
        <div className="row">
          <button className="btn primary" onClick={runNow} disabled={busy !== "" || data.running}>
            {busy === "run" || data.running ? <span className="spinner" /> : null} Run checks now
          </button>
          <button className="btn" onClick={testTelegram} disabled={busy !== ""}>Send Telegram test</button>
        </div>
      </div>
      {msg && <div className="card small" style={{ marginBottom: 16 }}>{msg}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Open natural events (NASA EONET, last 30 days) and watched regions</div>
        <div className="mapbox">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/globe-texture" alt="NASA Blue Marble world map" />
          {data.watchlist.map((w) => (
            <div
              key={w.id}
              className="wbox"
              title={w.name}
              style={{
                left: `${((w.bbox.west + 180) / 360) * 100}%`,
                top: `${((90 - w.bbox.north) / 180) * 100}%`,
                width: `${((w.bbox.east - w.bbox.west) / 360) * 100}%`,
                height: `${((w.bbox.north - w.bbox.south) / 180) * 100}%`,
              }}
            />
          ))}
          {events.map((e) => (
            <a key={e.id} href={e.link} target="_blank" rel="noreferrer" title={`${e.category}: ${e.title}`}>
              <span className="mapdot" style={{ ...pos(e.lat, e.lon), background: CAT_COLOR[e.category] ?? "#e6ebf5" }} />
            </a>
          ))}
        </div>
        <div className="row tiny muted" style={{ marginTop: 8 }}>
          {Object.entries(CAT_COLOR).map(([k, c]) => (
            <span key={k} className="row" style={{ gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: c, display: "inline-block" }} /> {k}
            </span>
          ))}
          <span>· {events.length} open events</span>
        </div>
      </div>

      <div className="grid g2">
        <div>
          <h2>Watchlist</h2>
          <div className="grid">
            {data.watchlist.map((w) => (
              <div className="card" key={w.id}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ margin: 0 }}>{w.name}</h3>
                  <div className="row">
                    {w.telegram && <span className="pill code">Telegram</span>}
                    <button className="btn danger" onClick={() => remove(w.id)}>Remove</button>
                  </div>
                </div>
                <div className="tiny muted" style={{ marginBottom: 8 }}>
                  {w.bbox.south} to {w.bbox.north} N, {w.bbox.west} to {w.bbox.east} E · last checked {w.lastRun ? new Date(w.lastRun).toLocaleString() : "never"}
                </div>
                {w.lastChecks?.length ? (
                  <table>
                    <tbody>
                      {w.lastChecks.map((c) => (
                        <tr key={c.rule} title={c.detail}>
                          <td style={{ width: 110 }}>{RULE_LABEL[c.rule]}</td>
                          <td><span className={`pill ${c.level === "n/a" ? "na" : c.level}`}>{c.level}</span></td>
                          <td className="small">{c.value}<div className="tiny muted">{c.detail}{c.link ? <> · <a href={c.link.url} target="_blank" rel="noreferrer">{c.link.label}</a></> : null}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="small muted">
                    Rules: {Object.entries(w.rules).filter(([, r]) => r.enabled).map(([k]) => RULE_LABEL[k]).join(", ")}. Run checks to see values.
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="eyebrow">Watch a new region</div>
            <div className="row">
              <div className="grow">
                <label>Region</label>
                <select value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value })}>
                  {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="grow">
                <label>Label (optional)</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Our school district" />
              </div>
            </div>
            <div className="row small" style={{ marginTop: 10 }}>
              {(["heat", "rain", "dry", "events", "fires"] as const).map((k) => (
                <label key={k} className="row" style={{ gap: 6, margin: 0, color: "var(--text)" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} /> {RULE_LABEL[k]}
                </label>
              ))}
              <label className="row" style={{ gap: 6, margin: 0, color: "var(--text)" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.checked })} /> Telegram
              </label>
              <label className="row" style={{ gap: 6, margin: 0 }}>
                heat z ≥ <input style={{ width: 60 }} value={form.z} onChange={(e) => setForm({ ...form, z: e.target.value })} />
              </label>
            </div>
            <button className="btn primary" style={{ marginTop: 12 }} onClick={add} disabled={busy !== ""}>Add to watchlist</button>
          </div>
        </div>

        <div>
          <h2>Alerts</h2>
          {data.alerts.length === 0 ? (
            <div className="empty">No alerts yet. Alerts appear when a check crosses its threshold; each one is sent to Telegram once.</div>
          ) : (
            <div className="card" style={{ padding: 10 }}>
              {data.alerts.slice(0, 60).map((a) => (
                <div key={a.id} className="tevent" style={{ gridTemplateColumns: "70px 1fr" }}>
                  <span className={`pill ${a.level}`} style={{ alignSelf: "start" }}>{a.level}</span>
                  <div className="small">
                    <b>{a.itemName}</b> · {RULE_LABEL[a.rule]} <span className="tiny muted">· {new Date(a.createdAt).toLocaleString()} · Telegram {a.telegram}</span>
                    <div>{a.link ? <a href={a.link} target="_blank" rel="noreferrer">{a.message}</a> : a.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="small muted" style={{ marginTop: 12 }}>
            Every run writes a report: see <Link href="/reports">Reports</Link>. Thresholds compare the latest NASA POWER daily data with the same calendar dates in
            1991-2020. Monitoring is plain software; our AI only writes an optional summary of new alerts.
          </p>
        </div>
      </div>
    </>
  );
}
