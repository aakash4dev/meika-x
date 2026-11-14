"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { agentById, type AgentId } from "@/lib/agents/meta";
import type { CaseRecord, Station, TranscriptEvent } from "@/lib/agents/types";
import { bboxCenter } from "@/lib/catalog";
import RichText from "../RichText";

const AgentRoom = dynamic(() => import("../AgentRoom"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }} className="muted">
      <span>
        <span className="spinner" /> Opening the lab...
      </span>
    </div>
  ),
});

const delay = (e?: TranscriptEvent) => (!e ? 800 : e.station ? 2600 : e.kind === "verdict" ? 2200 : 1300);

/** The live lab on the home page, replaying the latest finished case on a loop. */
export default function HomeRoom({ rec }: { rec: CaseRecord | null }) {
  const [shown, setShown] = useState(0);
  const total = rec?.transcript.length ?? 0;
  useEffect(() => {
    if (!rec) return;
    const t = setTimeout(() => setShown((s) => (s >= total ? 0 : s + 1)), shown >= total ? 5000 : delay(rec.transcript[shown - 1]));
    return () => clearTimeout(t);
  }, [shown, total, rec]);
  const events = useMemo(() => rec?.transcript.slice(0, shown) ?? [], [rec, shown]);
  const current = events.at(-1);
  const messages = useMemo(() => {
    const m: Partial<Record<AgentId, string>> = {};
    for (const e of events) m[e.agent] = e.text;
    return m;
  }, [events]);
  const targets = useMemo(() => {
    const t: Partial<Record<AgentId, Station>> = {};
    for (const e of events.slice(-2)) if (e.station) t[e.agent] = e.station;
    return t;
  }, [events]);
  return (
    <div className="lp-window">
      <div className="lp-chrome">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="title">MEIKA-X · Command Center{rec ? ` · ${rec.question}` : ""}</span>
        {rec && (
          <Link href={`/case/${rec.id}`} className="open">
            Open this case ↗
          </Link>
        )}
      </div>
      <div className="lp-stage">
        <AgentRoom
          activeAgent={current?.agent}
          messages={messages}
          spoken={[...new Set(events.map((e) => e.agent))]}
          regionCenter={rec?.plan ? bboxCenter(rec.plan.bbox) : undefined}
          running={shown < total}
          targets={targets}
          activeStations={[...new Set(Object.values(targets))] as Station[]}
          walk={false}
          view="close"
        />
        {events.length > 0 && (
          <div className="lp-ticker">
            {events.slice(-3).map((e) => (
              <div key={e.seq}>
                <b style={{ color: agentById(e.agent).color }}>{agentById(e.agent).name}</b> <RichText text={e.text} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
