"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AGENTS, agentById } from "@/lib/agents/meta";
import type { CaseRecord, TranscriptEvent } from "@/lib/agents/types";
import { stationById } from "@/lib/stations";
import RichText from "./RichText";

type Msg =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "ai"; text: string; followups: string[]; suggest: string | null; verified: boolean }
  | { id: string; kind: "agent"; ev: TranscriptEvent }
  | { id: string; kind: "case"; caseId: string; question: string; status: string; grade?: string; verdict?: string };

type Mode = "ask" | "case";
const uid = () => Math.random().toString(36).slice(2, 10);
const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2);

const WELCOME: Msg = {
  id: "welcome",
  kind: "ai",
  text: "Hi, I'm **Our AI**. You can **ask me** about MEIKA-X, NASA data, the statistics or any past case, or **start a discussion** and the eight agents will open a case on your question right here.",
  followups: ["How do the grades work?", "What has the lab found so far?", "Where does the data come from?"],
  suggest: "Is the Arctic warming faster than the rest of the world?",
  verified: true,
};

export default function ChatRoom() {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [mode, setMode] = useState<Mode>("ask");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("meika-chat");
      if (saved) setMsgs(JSON.parse(saved));
    } catch {
      /* storage may be blocked */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("meika-chat", JSON.stringify(msgs.slice(-80)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const push = (m: Msg) => setMsgs((x) => [...x, m]);

  async function ask(text: string) {
    push({ id: uid(), kind: "user", text });
    setBusy(true);
    const history = msgs
      .filter((m): m is Extract<Msg, { kind: "user" | "ai" }> => m.kind === "user" || m.kind === "ai")
      .map((m) => ({ role: m.kind === "user" ? ("user" as const) : ("assistant" as const), text: m.text }));
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      push({ id: uid(), kind: "ai", text: d.answer, followups: d.followups ?? [], suggest: d.suggestCase?.question ?? null, verified: d.verified });
    } catch (e) {
      push({ id: uid(), kind: "ai", text: `Sorry, that failed: ${(e as Error).message}`, followups: [], suggest: null, verified: true });
    }
    setBusy(false);
  }

  async function discuss(question: string) {
    push({ id: uid(), kind: "user", text: question });
    setBusy(true);
    try {
      const res = await fetch("/api/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      const cardId = uid();
      push({ id: cardId, kind: "case", caseId: d.id, question, status: "running" });
      let seen = 0;
      for (;;) {
        await new Promise((r) => setTimeout(r, 1200));
        const r = await fetch(`/api/cases/${d.id}`, { cache: "no-store" });
        if (!r.ok) break;
        const rec = (await r.json()) as CaseRecord;
        const fresh = rec.transcript.slice(seen);
        seen = rec.transcript.length;
        if (fresh.length) setMsgs((x) => [...x, ...fresh.map((ev) => ({ id: uid(), kind: "agent" as const, ev }))]);
        if (rec.status !== "running") {
          setMsgs((x) => [
            ...x.filter((m) => m.id !== cardId),
            { id: cardId, kind: "case", caseId: d.id, question, status: rec.status, grade: rec.results.grade, verdict: rec.results.verdict ?? rec.error },
          ]);
          break;
        }
      }
    } catch (e) {
      push({ id: uid(), kind: "ai", text: `Could not open the case: ${(e as Error).message}`, followups: [], suggest: null, verified: true });
    }
    setBusy(false);
  }

  function send(text = input) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    void (mode === "ask" ? ask(t) : discuss(t));
  }

  return (
    <div className="chat">
      <header className="chat-head">
        <div className="chat-avatars">
          {AGENTS.map((a) => (
            <span key={a.id} style={{ background: a.color }} title={a.name}>
              {initials(a.name)}
            </span>
          ))}
        </div>
        <div>
          <b>Chat room</b>
          <small>Our AI and eight agents · answers link to their data</small>
        </div>
        <button
          className="btn ghost"
          style={{ marginLeft: "auto" }}
          onClick={() => {
            setMsgs([WELCOME]);
          }}
        >
          New chat
        </button>
      </header>

      <div className="chat-thread">
        {msgs.map((m, i) => {
          if (m.kind === "user")
            return (
              <div key={m.id} className="chat-me">
                <div className="chat-bubble">{m.text}</div>
              </div>
            );
          if (m.kind === "ai")
            return (
              <div key={m.id} className="chat-row">
                <span className="chat-av ai">AI</span>
                <div className="chat-body">
                  <div className="chat-name">
                    Our AI {!m.verified && <em>unverified numbers</em>}
                  </div>
                  <div className="chat-bubble">
                    <RichText text={m.text.replace(/\*\*([^*]+)\*\*/g, "$1")} />
                  </div>
                  <div className="chat-options">
                    {m.suggest && (
                      <button className="chip primary" disabled={busy} onClick={() => void discuss(m.suggest!)}>
                        ▶ Start a discussion: {m.suggest}
                      </button>
                    )}
                    {m.followups.map((f) => (
                      <button key={f} className="chip" disabled={busy} onClick={() => void ask(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          if (m.kind === "agent") {
            const a = agentById(m.ev.agent);
            const prev = msgs[i - 1];
            const same = prev?.kind === "agent" && prev.ev.agent === m.ev.agent;
            return (
              <div key={m.id} className={`chat-row ${same ? "same" : ""}`}>
                <span className="chat-av" style={{ background: same ? "transparent" : a.color }}>
                  {same ? "" : initials(a.name)}
                </span>
                <div className="chat-body">
                  {!same && (
                    <div className="chat-name" style={{ color: a.color }}>
                      {a.name}
                      {m.ev.station && <em>@ {stationById(m.ev.station).name}</em>}
                    </div>
                  )}
                  <div className={`chat-bubble ${m.ev.kind}`}>
                    <RichText text={m.ev.text} />
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="chat-case">
              {m.status === "running" ? (
                <>
                  <span className="spinner" /> The agents are investigating “{m.question}”…{" "}
                  <Link href={`/case/${m.caseId}`}>Watch in the 3D lab ↗</Link>
                </>
              ) : (
                <>
                  {m.grade && <span className={`grade ${m.grade}`}>{m.grade}</span>}
                  <div>
                    <b>Verdict</b>
                    <p>{m.verdict}</p>
                    <div className="row">
                      <Link className="btn primary" href={`/case/${m.caseId}`}>
                        Enter the 3D lab ↗
                      </Link>
                      <a className="btn" href={`/api/cases/${m.caseId}/data.csv`}>
                        Data CSV
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {busy && msgs.at(-1)?.kind === "user" && (
          <div className="chat-row">
            <span className="chat-av ai">AI</span>
            <div className="chat-typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <footer className="chat-compose">
        <div className="chat-modes" role="tablist">
          <button className={mode === "ask" ? "on" : ""} onClick={() => setMode("ask")}>
            💬 Ask Our AI
          </button>
          <button className={mode === "case" ? "on" : ""} onClick={() => setMode("case")}>
            🔬 Start a discussion
          </button>
          <span className="tiny muted">{mode === "ask" ? "Questions about data, methods and past cases" : "The agents open a case and investigate here"}</span>
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "ask" ? "Ask anything, e.g. Why did a case get grade C?" : "What should the agents investigate? e.g. Is the Sahel getting wetter?"}
          />
          <button className="btn primary" disabled={busy || !input.trim()}>
            {busy ? <span className="spinner" /> : "Send"}
          </button>
        </form>
      </footer>
    </div>
  );
}
