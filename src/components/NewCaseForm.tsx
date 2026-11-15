"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REGIONS, STARTERS, VARIABLES, variableById } from "@/lib/catalog";

export default function NewCaseForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [variable, setVariable] = useState("");
  const [regionId, setRegionId] = useState("");
  const [custom, setCustom] = useState({ west: "", south: "", east: "", north: "" });
  const [startYear, setStartYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const v = variable ? variableById(variable) : undefined;

  async function submit(q = question, vr = variable, rg = regionId) {
    if (!q.trim()) {
      setError("Ask a question first, or tap a starter.");
      return;
    }
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = { question: q };
    if (vr) body.variable = vr;
    if (rg === "custom") body.bbox = Object.fromEntries(Object.entries(custom).map(([k, val]) => [k, Number(val)]));
    else if (rg) body.regionId = rg;
    if (startYear) body.startYear = Number(startYear);
    try {
      const res = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open the case");
      router.push(`/case/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="eyebrow">Research</div>
      <div className="field">
        <label htmlFor="q">What do you want to investigate?</label>
        <textarea
          id="q"
          rows={2}
          placeholder="e.g. Are European summers getting hotter?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        {STARTERS.map((s) => (
          <button
            key={s.question}
            className="chip"
            disabled={busy}
            onClick={() => {
              setQuestion(s.question);
              setVariable(s.variable);
              setRegionId(s.region);
              void submit(s.question, s.variable, s.region);
            }}
          >
            {s.question}
          </button>
        ))}
      </div>
      <div className="row">
        <div className="grow">
          <label htmlFor="var">Variable</label>
          <select id="var" value={variable} onChange={(e) => setVariable(e.target.value)}>
            <option value="">Let the Chief Detective choose</option>
            {VARIABLES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grow">
          <label htmlFor="reg">Region</label>
          <select id="reg" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            <option value="">Let the Chief Detective choose</option>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            <option value="custom">Custom box (lat/lon)</option>
          </select>
        </div>
        <div style={{ width: 120 }}>
          <label htmlFor="sy">From year</label>
          <input id="sy" inputMode="numeric" placeholder="1981" value={startYear} onChange={(e) => setStartYear(e.target.value)} />
        </div>
      </div>
      {regionId === "custom" && (
        <div className="row" style={{ marginTop: 10 }}>
          {(["west", "south", "east", "north"] as const).map((k) => (
            <div className="grow" key={k}>
              <label>{k} (deg)</label>
              <input inputMode="decimal" value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} />
            </div>
          ))}
        </div>
      )}
      {v && (
        <p className="small muted" style={{ marginTop: 10 }}>
          <b style={{ color: "var(--text)" }}>{v.name}</b> ({v.units}): {v.definition} <i>Source: {v.source}.</i>
        </p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy} onClick={() => void submit()}>
          {busy ? <span className="spinner" /> : null} Open case and convene the agents
        </button>
        {error && <span className="small" style={{ color: "var(--alert)" }}>{error}</span>}
      </div>
    </div>
  );
}
