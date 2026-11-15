"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentId } from "@/lib/agents/meta";
import type { CaseRecord, Station } from "@/lib/agents/types";
import { bboxCenter } from "@/lib/catalog";

const AgentRoom = dynamic(() => import("../AgentRoom"), { ssr: false });

/** A case shown as its own small lab. The room mounts when scrolled into view and replays the case while hovered. */
/** What a room card needs: the plan, the verdict and the agents' trips to data terminals. */
export type RoomCardCase = Pick<CaseRecord, "id" | "question" | "plan" | "transcript"> & { results: Pick<CaseRecord["results"], "grade" | "verdict"> };

export default function CaseRoomCard({ rec, index }: { rec: RoomCardCase; index: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setVisible(true), io.disconnect()), { rootMargin: "200px" });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const events = useMemo(() => rec.transcript.filter((e) => e.station), [rec]);
  useEffect(() => {
    if (!hover || !events.length) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % events.length), 2400);
    return () => clearTimeout(t);
  }, [hover, step, events.length]);
  const cur = hover ? events[step] : undefined;
  const targets: Partial<Record<AgentId, Station>> = cur?.station ? { [cur.agent]: cur.station } : {};
  const p = rec.plan!;
  return (
    <Link
      ref={ref}
      href={`/case/${rec.id}`}
      className="lp-room"
      data-reveal
      style={{ ["--d" as string]: `${(index % 3) * 90}ms` }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="lp-roomstage">
        {visible ? (
          <AgentRoom
            compact
            paused={!hover}
            view="card"
            activeAgent={cur?.agent}
            messages={{}}
            spoken={[]}
            regionCenter={bboxCenter(p.bbox)}
            running={hover}
            targets={targets}
            activeStations={cur?.station ? [cur.station] : []}
            walk={false}
          />
        ) : (
          <div className="ph">Loading the lab…</div>
        )}
        <span className="live">
          <i /> {hover ? "replaying" : "hover to replay"}
        </span>
        {rec.results.grade && <span className={`grade ${rec.results.grade} lp-roomgrade`} style={{ width: 34, height: 34, fontSize: 16, borderRadius: 9 }}>{rec.results.grade}</span>}
      </div>
      <div className="lp-roombody">
        <h3>{rec.question}</h3>
        <div className="meta">
          {p.variableName} · {p.regionName} · {p.startYear}–{p.endYear}
        </div>
        <p>{rec.results.verdict}</p>
      </div>
    </Link>
  );
}
