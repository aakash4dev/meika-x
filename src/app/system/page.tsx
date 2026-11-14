import { AGENTS } from "@/lib/agents/meta";
import SystemStatus from "@/components/SystemStatus";
import AgentTree from "@/components/AgentTree";

export const metadata = { title: "Agents & system · MEIKA-X" };

export default function SystemPage() {
  return (
    <main className="container">
      <h1>The agent society</h1>
      <p className="muted" style={{ maxWidth: 820 }}>
        Eight agents, each with a narrow job, a fixed set of tools and a defined output. They share one case state and communicate through the evidence
        ledger, so runs are replayable. Numbers come from deterministic code; our AI (running on Anthropic Claude) is used only where language or vision is the job, and every AI
        step has a non-AI fallback.
      </p>
      <div style={{ margin: "18px 0" }}>
        <AgentTree question="Is the monsoon changing the same way everywhere?" snippets={["GET power.larc.nasa.gov", "+ slope per decade", "Mann-Kendall (Hamed-Rao)", "grade = A..D", "GET eonet …/events", "+ FDR 5% per cell", "brief.hi ✓ number check", "Granger p"]} />
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Engine</th>
              <th>Job</th>
              <th>Tools</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map((a) => (
              <tr key={a.id}>
                <td style={{ color: a.color, fontWeight: 700, whiteSpace: "nowrap" }}>{a.name}</td>
                <td>
                  <span className={`pill ${a.engine}`}>{a.engine === "code" ? "code" : a.engine === "ai" ? "Our AI" : "code + AI"}</span>
                </td>
                <td className="small">
                  {a.job}
                  {a.aiRole && <div className="tiny muted">AI: {a.aiRole}</div>}
                </td>
                <td className="small muted">{a.tools}</td>
                <td className="small muted">{a.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 28 }}>Rules of the room</h2>
      <ul className="small" style={{ maxWidth: 860 }}>
        <li>The Skeptic can lower a grade but cannot change data. Grade A needs an independent sensor dataset, so the current POWER-only build tops out at B.</li>
        <li>The Narrator may only quote ledger rows. An automated check rejects any number in the brief that is not in the ledger; after one retry it falls back to a fixed template.</li>
        <li>Every agent action is logged in the case transcript, and the bootstrap and placebo tests use fixed seeds, so the same case gives the same ledger.</li>
        <li>Forecasts are analog climatology, not weather forecasts, and say so. Correlations are associations, not causes.</li>
      </ul>

      <h2 style={{ marginTop: 28 }}>Integrations</h2>
      <SystemStatus />
    </main>
  );
}
