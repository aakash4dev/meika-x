// Case runtime: holds live case state in memory (shared across route bundles via globalThis),
// persists it to .data/cases, and gives agents emit() and ledger() helpers.
import { dataPath, listJSON, readJSON, writeJSON } from "../store";
import type { AgentId, CaseRecord, EventKind, LedgerRow, Station } from "./types";

type G = typeof globalThis & { __meikaCases?: Map<string, CaseRecord> };
const g = globalThis as G;
const live = (g.__meikaCases ??= new Map<string, CaseRecord>());

const PACE_MS = Number(process.env.CASE_PACING_MS ?? 450);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const caseFile = (id: string) => dataPath("cases", `${id}.json`);

/** A case left "running" by a server restart is reported as interrupted instead of hanging forever. */
function settle(rec: CaseRecord): CaseRecord {
  if (rec.status === "running" && !live.has(rec.id)) {
    return { ...rec, status: "error", error: "Interrupted: the server restarted while this case was running. Open it again to re-run." };
  }
  return rec;
}

export async function getCase(id: string): Promise<CaseRecord | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  const rec = live.get(id) ?? (await readJSON<CaseRecord | null>(caseFile(id), null));
  return rec ? settle(rec) : null;
}

export async function listCases(): Promise<CaseRecord[]> {
  const stored = await listJSON<CaseRecord>(dataPath("cases"));
  const byId = new Map(stored.map((c) => [c.id, c]));
  for (const c of live.values()) byId.set(c.id, c);
  return [...byId.values()].map(settle).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export class CaseContext {
  rec: CaseRecord;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(rec: CaseRecord) {
    this.rec = rec;
    live.set(rec.id, rec);
  }

  get id() {
    return this.rec.id;
  }

  private touch() {
    this.rec.updatedAt = new Date().toISOString();
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void writeJSON(caseFile(this.rec.id), this.rec);
    }, 400);
  }

  /** Record an external query (shown as a link in chat, reports and the station panel). Returns a markdown link. */
  source(agent: AgentId, station: Station, label: string, url: string): string {
    (this.rec.sources ??= []).push({ agent, station, label, url, at: new Date().toISOString() });
    this.touch();
    return `[${label}](${url})`;
  }

  async emit(
    agent: AgentId,
    kind: EventKind,
    text: string,
    extra: { target?: AgentId; ledgerIds?: string[]; station?: Station } = {},
  ) {
    this.rec.activeAgent = agent;
    this.rec.transcript.push({
      seq: this.rec.transcript.length + 1,
      ts: new Date().toISOString(),
      agent,
      kind,
      text,
      ...extra,
    });
    this.touch();
    if (kind === "say" || kind === "plan" || kind === "handoff" || kind === "verdict" || extra.station) await sleep(PACE_MS);
  }

  ledger(
    agent: AgentId,
    key: string,
    label: string,
    value: LedgerRow["value"],
    opts: { display?: string; unit?: string; dataset: string; method: string; source?: { label: string; url: string } },
  ): LedgerRow {
    const row: LedgerRow = {
      id: `L${String(this.rec.ledger.length + 1).padStart(3, "0")}`,
      agent,
      key,
      label,
      value,
      display: opts.display ?? String(value),
      unit: opts.unit,
      dataset: opts.dataset,
      method: opts.method,
      source: opts.source,
    };
    this.rec.ledger.push(row);
    this.touch();
    return row;
  }

  find(key: string) {
    return this.rec.ledger.find((r) => r.key === key);
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await writeJSON(caseFile(this.rec.id), this.rec);
  }

  async finish(status: "done" | "error", error?: string) {
    this.rec.status = status;
    if (error) this.rec.error = error;
    this.rec.activeAgent = undefined;
    await this.flush();
    // keep in memory for a while so polling clients see the final state, then drop
    setTimeout(() => live.delete(this.rec.id), 10 * 60 * 1000);
  }
}
