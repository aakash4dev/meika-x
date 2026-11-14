"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STARTERS } from "@/lib/catalog";

/** One-box start: type a question about a place, the Chief Detective plans the rest. */
export default function HeroAsk() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go(question: string, variable?: string, regionId?: string) {
    if (!question.trim()) return setErr("Type a question first, or tap one below.");
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, variable, regionId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not open the case");
      router.push(`/case/${d.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="lp-ask">
      <form
        className="lp-askbox"
        onSubmit={(e) => {
          e.preventDefault();
          void go(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about any place on Earth, e.g. Is the Arctic warming?" aria-label="Your question" />
        <button className="btn primary" disabled={busy}>
          {busy ? <span className="spinner" /> : null} Open a case
        </button>
      </form>
      <div className="lp-starters">
        {STARTERS.slice(0, 4).map((s) => (
          <button key={s.question} type="button" className="chip" disabled={busy} onClick={() => void go(s.question, s.variable, s.region)}>
            {s.question}
          </button>
        ))}
      </div>
      {err && <div className="small" style={{ color: "var(--alert)", marginTop: 8 }}>{err}</div>}
    </div>
  );
}
