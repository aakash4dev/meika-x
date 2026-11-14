import Link from "next/link";
import NewCaseForm from "@/components/NewCaseForm";
import { listCases } from "@/lib/agents/runtime";
import { AGENTS } from "@/lib/agents/meta";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cases = (await listCases()).slice(0, 12);
  return (
    <main className="container">
      <section className="hero">
        <div>
          <div className="eyebrow">NASA Space Apps 2026 · Be An Earth System Trend Detective</div>
          <h1>MEIKA-X</h1>
          <div className="tagline">Every trend gets a trial before it gets a headline.</div>
          <p className="muted">
            Ask a question about the Earth. Eight agents open a case: the Statistician measures the trend in NASA data, the Satellite Witness checks
            fresh imagery, the Driver Analyst tests causes, and the Skeptic tries to break the finding before you see it. Every number lands in an
            evidence ledger, and the verdict comes with a grade from A to D.
          </p>
          <div className="row small muted">
            {AGENTS.map((a) => (
              <span key={a.id} className="row" style={{ gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: a.color, display: "inline-block" }} />
                {a.name}
              </span>
            ))}
          </div>
        </div>
        <NewCaseForm />
      </section>

      <section style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Recent cases</h2>
          <span className="small muted">
            Also: <Link href="/monitor">active monitoring</Link> · <Link href="/reports">reports</Link>
          </span>
        </div>
        {cases.length === 0 ? (
          <div className="empty">No cases yet. Tap a starter question above to open the first one.</div>
        ) : (
          <div className="grid g3">
            {cases.map((c) => (
              <Link key={c.id} href={`/case/${c.id}`} className="card" style={{ color: "var(--text)", textDecoration: "none" }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <span className={`pill ${c.status}`}>{c.status}</span>
                  {c.results.grade && <span className={`grade ${c.results.grade}`} style={{ width: 32, height: 32, fontSize: "1.1rem" }}>{c.results.grade}</span>}
                </div>
                <h3 style={{ marginBottom: 4 }}>{c.question}</h3>
                <div className="small muted">
                  {c.plan ? `${c.plan.variableName} · ${c.plan.regionName}` : "planning..."}
                </div>
                {c.results.verdict && <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>{c.results.verdict.slice(0, 180)}{c.results.verdict.length > 180 ? "..." : ""}</p>}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
