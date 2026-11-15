// Case runtime: holds live case state in memory (shared across route bundles via globalThis),
// persists it to Supabase (table `cases`), and gives agents emit() and ledger() helpers.
import { check, db } from "../supabase/admin";
import type { AgentId, CaseRecord, EventKind, LedgerRow, Station } from "./types";

type G = typeof globalThis & { __meikaCases?: Map<string, CaseRecord> };
const g = globalThis as G;
const live = (g.__meikaCases ??= new Map<string, CaseRecord>());

const PACE_MS = Number(process.env.CASE_PACING_MS ?? 450);
const SAVE_DEBOUNCE_MS = 800;
/** A "running" case with no update for this long is treated as interrupted (server restart, function timeout). */
const STALE_MS = 5 * 60 * 1000;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A case list entry: the record without its transcript, ledger and monthly series. */
export type CaseSummary = Omit<CaseRecord, "transcript" | "ledger"> & { ledgerCount: number };

function settle<T extends Pick<CaseRecord, "id" | "status" | "updatedAt" | "error">>(rec: T): T {
  if (rec.status === "running" && !live.has(rec.id) && Date.now() - Date.parse(rec.updatedAt) > STALE_MS) {
    return { ...rec, status: "error", error: "Interrupted: the server stopped while this case was running. Open it again to re-run." };
  }
  return rec;
}

function row(rec: CaseRecord, userId: string | null) {
  return {
    id: rec.id,
    user_id: userId,
    question: rec.question,
    status: rec.status,
    grade: rec.results.grade ?? null,
    region_name: rec.plan?.regionName ?? null,
    variable_name: rec.plan?.variableName ?? null,
    created_at: rec.createdAt,
    updated_at: rec.updatedAt,
    record: rec,
  };
}

export async function getCase(id: string): Promise<CaseRecord | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  const mem = live.get(id);
  if (mem) return mem;
  const data = check(await db().from("cases").select("record").eq("id", id).maybeSingle(), "read case");
  return data ? settle(data.record as CaseRecord) : null;
}

/** Newest first, without the heavy parts of each record (use getCase for one full record). */
export async function listCases(limit = 200): Promise<CaseSummary[]> {
  const data = check(
    await db().from("case_summaries").select("record, ledger_count").order("created_at", { ascending: false }).limit(limit),
    "list cases",
  );
  const out = new Map<string, CaseSummary>();
  for (const r of data ?? []) {
    const rec = r.record as CaseRecord;
    const { transcript: _t, ledger: _l, ...rest } = rec;
    out.set(rec.id, { ...rest, ledgerCount: r.ledger_count as number });
  }
  // live cases are fresher than their last saved copy
  for (const rec of live.values()) {
    const { transcript: _t, ledger, ...rest } = rec;
    out.set(rec.id, { ...rest, ledgerCount: ledger.length });
  }
  return [...out.values()].map(settle).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function countRunningCases(): Promise<number> {
  const data = check(
    await db().from("cases").select("id, status, updated_at").eq("status", "running"),
    "count running cases",
  );
  return (data ?? []).filter((r) => live.has(r.id) || Date.now() - Date.parse(r.updated_at) <= STALE_MS).length;
}

export class CaseContext {
  rec: CaseRecord;
  readonly userId: string | null;
  private saveTimer: NodeJS.Timeout | null = null;
  /** Writes are chained so an older snapshot can never overwrite a newer one. */
  private saving: Promise<void> = Promise.resolve();

  constructor(rec: CaseRecord, userId: string | null = null) {
    this.rec = rec;
    this.userId = userId;
    live.set(rec.id, rec);
  }

  get id() {
    return this.rec.id;
  }

  private save(): Promise<void> {
    const snapshot = row(structuredClone(this.rec), this.userId);
    this.saving = this.saving
      .then(async () => {
        const { error } = await db().from("cases").upsert(snapshot);
        if (error) console.error(`[case ${snapshot.id}] save failed: ${error.message}`);
      })
      .catch((e) => console.error(`[case ${snapshot.id}] save failed: ${(e as Error).message}`));
    return this.saving;
  }

  private touch() {
    this.rec.updatedAt = new Date().toISOString();
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, SAVE_DEBOUNCE_MS);
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
    await this.save();
  }

  async finish(status: "done" | "error", error?: string) {
    this.rec.status = status;
    if (error) this.rec.error = error;
    this.rec.activeAgent = undefined;
    await this.flush();
    // keep in memory for a while so polling clients on this instance see the final state, then drop
    setTimeout(() => live.delete(this.rec.id), 10 * 60 * 1000).unref?.();
  }
}
