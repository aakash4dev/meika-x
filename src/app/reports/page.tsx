import Link from "next/link";
import { listReports } from "@/lib/report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports · MEIKA-X" };

export default async function ReportsPage() {
  const reports = await listReports();
  const cases = reports.filter((r) => r.kind === "case");
  const runs = reports.filter((r) => r.kind === "monitor");
  return (
    <main className="container">
      <h1>Reports</h1>
      <p className="muted">Case Files from agent investigations and reports from every monitoring run. Each one downloads as Markdown.</p>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <section>
          <h2>Case Files ({cases.length})</h2>
          {cases.length === 0 && <div className="empty">No case reports yet. <Link href="/">Research</Link>.</div>}
          <div className="grid">
            {cases.map((r) => (
              <div key={r.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Link href={`/reports/${r.id}`}><h3 style={{ margin: 0 }}>{r.title}</h3></Link>
                  {r.grade && <span className={`grade ${r.grade}`} style={{ width: 32, height: 32, fontSize: "1.1rem" }}>{r.grade}</span>}
                </div>
                <p className="small" style={{ margin: "6px 0" }}>{r.summary}</p>
                <div className="tiny muted">
                  {new Date(r.createdAt).toLocaleString()} · <a href={`/api/reports/${r.id}?format=md`}>.md</a>
                  {r.caseId ? <> · <Link href={`/case/${r.caseId}`}>open agent room</Link></> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Monitoring runs ({runs.length})</h2>
          {runs.length === 0 && <div className="empty">No monitoring runs yet. <Link href="/monitor">Run checks</Link>.</div>}
          <div className="grid">
            {runs.slice(0, 40).map((r) => (
              <div key={r.id} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Link href={`/reports/${r.id}`}><h3 style={{ margin: 0 }}>{r.title}</h3></Link>
                  <span className={`pill ${r.alerts ? "alert" : "ok"}`}>{r.alerts ?? 0} alerts</span>
                </div>
                <p className="small" style={{ margin: "6px 0" }}>{r.summary}</p>
                <div className="tiny muted">{new Date(r.createdAt).toLocaleString()} · <a href={`/api/reports/${r.id}?format=md`}>.md</a></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
