// Monitoring run: checks every watch item, raises de-duplicated alerts, sends Telegram, writes a report.
import { REGIONS, regionById, type BBox } from "../catalog";
import { aiText } from "../ai/claude";
import { saveReport } from "../report";
import { newId } from "../store";
import { check, db } from "../supabase/admin";
import { sendTelegram, telegramEnabled } from "../telegram";
import { runChecks } from "./checks";
import { DEFAULT_RULES, type Alert, type CheckResult, type MonitorState, type WatchItem, type WatchRules } from "./types";

type G = typeof globalThis & { __meikaMonitorRunning?: boolean };
const g = globalThis as G;

// ------------------------------------------------------------------ storage (Supabase)

type WatchRow = {
  id: string;
  name: string;
  region_id: string | null;
  bbox: BBox;
  rules: WatchRules;
  telegram: boolean;
  last_run: string | null;
  last_checks: CheckResult[] | null;
  created_at: string;
};

const fromWatchRow = (r: WatchRow): WatchItem => ({
  id: r.id,
  name: r.name,
  regionId: r.region_id ?? undefined,
  bbox: r.bbox,
  rules: r.rules,
  telegram: r.telegram,
  createdAt: r.created_at,
  lastRun: r.last_run ?? undefined,
  lastChecks: r.last_checks ?? undefined,
});

const toWatchRow = (w: WatchItem): WatchRow => ({
  id: w.id,
  name: w.name,
  region_id: w.regionId ?? null,
  bbox: w.bbox,
  rules: w.rules,
  telegram: w.telegram,
  last_run: w.lastRun ?? null,
  last_checks: w.lastChecks ?? null,
  created_at: w.createdAt,
});

type AlertRow = {
  id: string;
  item_id: string;
  item_name: string;
  rule: Alert["rule"];
  level: Alert["level"];
  message: string;
  link: string | null;
  key: string;
  telegram: Alert["telegram"];
  created_at: string;
};

const fromAlertRow = (r: AlertRow): Alert => ({
  id: r.id,
  itemId: r.item_id,
  itemName: r.item_name,
  rule: r.rule,
  level: r.level,
  message: r.message,
  link: r.link ?? undefined,
  key: r.key,
  telegram: r.telegram,
  createdAt: r.created_at,
});

const toAlertRow = (a: Alert): AlertRow => ({
  id: a.id,
  item_id: a.itemId,
  item_name: a.itemName,
  rule: a.rule,
  level: a.level,
  message: a.message,
  link: a.link ?? null,
  key: a.key,
  telegram: a.telegram,
  created_at: a.createdAt,
});

/** Starter watchlist for a fresh database: one region per inhabited continent. */
function seedWatchlist(): WatchItem[] {
  const now = new Date().toISOString();
  return ["california", "amazon", "central-europe", "east-africa", "delhi-ncr", "se-australia"].map((id) => {
    const r = regionById(id)!;
    return { id: newId("watch"), name: r.name, regionId: id, bbox: r.bbox, rules: structuredClone(DEFAULT_RULES), telegram: true, createdAt: now };
  });
}

type StoredState = MonitorState & { seeded?: boolean };

async function readState(): Promise<StoredState> {
  const data = check(await db().from("monitor_state").select("state").eq("id", 1).maybeSingle(), "read monitor state");
  return { runs: 0, seenEvents: {}, alertKeys: {}, ...((data?.state as StoredState | undefined) ?? {}) };
}

async function writeState(state: StoredState) {
  check(await db().from("monitor_state").upsert({ id: 1, state, updated_at: new Date().toISOString() }), "save monitor state");
}

export async function getWatchlist(): Promise<WatchItem[]> {
  const data = check(await db().from("watchlist").select("*").order("created_at", { ascending: true }), "read watchlist");
  if (data?.length) return data.map((r) => fromWatchRow(r as WatchRow));
  // Seed once per database; after that an empty watchlist means the team removed everything.
  const state = await readState();
  if (state.seeded) return [];
  const seeded = seedWatchlist();
  check(await db().from("watchlist").insert(seeded.map(toWatchRow)), "seed watchlist");
  await writeState({ ...state, seeded: true });
  return seeded;
}

/** Saves run results (last run and checks) for every item in the list. */
export async function saveWatchlist(list: WatchItem[]) {
  if (!list.length) return;
  check(await db().from("watchlist").upsert(list.map(toWatchRow)), "save watchlist");
}

export async function addWatchItem(input: { name?: string; regionId?: string; bbox?: BBox; rules?: Partial<WatchRules>; telegram?: boolean }) {
  const region = input.regionId ? regionById(input.regionId) : undefined;
  const bbox = region?.bbox ?? input.bbox;
  if (!bbox) throw new Error("A region or a bounding box is required.");
  const rules: WatchRules = { ...structuredClone(DEFAULT_RULES), ...(input.rules ?? {}) } as WatchRules;
  const item: WatchItem = {
    id: newId("watch"),
    name: (input.name || region?.name || "Custom region").slice(0, 80),
    regionId: region?.id,
    bbox,
    rules,
    telegram: input.telegram ?? true,
    createdAt: new Date().toISOString(),
  };
  check(await db().from("watchlist").insert(toWatchRow(item)), "add watch item");
  return item;
}

export async function removeWatchItem(id: string) {
  check(await db().from("watchlist").delete().eq("id", id), "remove watch item");
}

export async function getAlerts(limit = 200): Promise<Alert[]> {
  const data = check(await db().from("alerts").select("*").order("created_at", { ascending: false }).limit(limit), "read alerts");
  return (data ?? []).map((r) => fromAlertRow(r as AlertRow));
}

export async function getMonitorState(): Promise<MonitorState> {
  const { seeded: _s, ...state } = await readState();
  return state;
}

export const isMonitorRunning = () => Boolean(g.__meikaMonitorRunning);

const ICON: Record<string, string> = { heat: "🌡️", rain: "🌧️", dry: "🏜️", events: "🛰️", fires: "🔥" };
const RULE_NAME: Record<string, string> = { heat: "Heat", rain: "Heavy rain", dry: "Dry spell", events: "Natural event", fires: "Fires" };

export async function runMonitor(trigger: string) {
  if (g.__meikaMonitorRunning) return { skipped: true as const, reason: "A monitoring run is already in progress." };
  g.__meikaMonitorRunning = true;
  const started = new Date();
  const today = started.toISOString().slice(0, 10);
  try {
    const list = await getWatchlist();
    const state = await readState();
    const newAlerts: Alert[] = [];
    const sections: string[] = [];

    for (const item of list) {
      let checks: CheckResult[] = [];
      try {
        const seen = new Set(state.seenEvents[item.id] ?? []);
        const firstRun = !state.seenEvents[item.id];
        const { results, newEvents } = await runChecks(item.bbox, item.rules, seen);
        checks = results;
        for (const e of newEvents) seen.add(e.id);
        state.seenEvents[item.id] = [...seen].slice(-500);

        for (const c of results) {
          if (c.level !== "alert" && !(c.rule === "events" && c.level === "watch")) continue;
          if (c.rule === "events") {
            // On the first run for an item, record existing events silently instead of flooding alerts.
            if (firstRun) continue;
            for (const e of newEvents) {
              newAlerts.push({
                id: newId("alert"),
                itemId: item.id,
                itemName: item.name,
                rule: "events",
                level: c.level,
                message: `${e.category}: ${e.title} (${e.date.slice(0, 10)})`,
                createdAt: started.toISOString(),
                key: `${item.id}:event:${e.id}`,
                telegram: "off",
                link: e.link,
              });
            }
            continue;
          }
          const key = `${item.id}:${c.rule}:${today}`;
          if (state.alertKeys[key]) continue;
          state.alertKeys[key] = started.toISOString();
          newAlerts.push({
            id: newId("alert"),
            itemId: item.id,
            itemName: item.name,
            rule: c.rule,
            level: c.level,
            message: `${RULE_NAME[c.rule]}: ${c.value}. ${c.detail}`,
            link: c.link?.url,
            createdAt: started.toISOString(),
            key,
            telegram: "off",
          });
        }
      } catch (e) {
        checks = [{ rule: "events", level: "n/a", value: "error", detail: `Run failed: ${(e as Error).message}` }];
      }
      item.lastRun = started.toISOString();
      item.lastChecks = checks;
      sections.push(
        `### ${item.name}\n\n| Check | Level | Value | Detail |\n|---|---|---|---|\n` +
          checks.map((c) => `| ${RULE_NAME[c.rule]} | ${c.level.toUpperCase()} | ${c.value} | ${c.detail.replace(/\|/g, "/")}${c.link ? ` ([${c.link.label}](${c.link.url}))` : ""} |`).join("\n"),
      );
    }

    // Optional AI digest of new alerts (numbers must come from the alert text).
    let digest = "";
    if (newAlerts.length && process.env.MONITOR_AI_DIGEST !== "off") {
      const input = newAlerts.map((a) => `${a.itemName} | ${a.message}`).join("\n");
      const ai = await aiText({
        system:
          "You summarise environmental monitoring alerts for a team chat. Two or three plain sentences. Use only facts and numbers that appear in the alerts, copied exactly. No advice beyond 'check official sources'.",
        prompt: input,
        effort: "low",
      });
      if (ai) {
        const allowed = new Set((input.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
        const bad = (ai.data.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))).filter((n) => !allowed.has(n));
        if (!bad.length) digest = ai.data;
      }
    }

    // Telegram: one message per item with new alerts.
    if (newAlerts.length) {
      const byItem = new Map<string, Alert[]>();
      for (const a of newAlerts) byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a]);
      for (const [itemId, items] of byItem) {
        const item = list.find((w) => w.id === itemId);
        if (!item?.telegram || !telegramEnabled()) {
          items.forEach((a) => (a.telegram = telegramEnabled() ? "skipped" : "off"));
          continue;
        }
        const text =
          `MEIKA-X alert: ${items[0].itemName}\n` +
          items.map((a) => `${ICON[a.rule] ?? "•"} ${a.level.toUpperCase()} ${a.message}${a.link ? `\n${a.link}` : ""}`).join("\n") +
          (digest ? `\n\nAI summary: ${digest}` : "") +
          "\n\nAdvisory only. Check official warnings from your national weather service.";
        const res = await sendTelegram(text);
        items.forEach((a) => (a.telegram = res.ok ? "sent" : "failed"));
      }
    }

    if (newAlerts.length) check(await db().from("alerts").insert(newAlerts.map(toAlertRow)), "save alerts");
    await saveWatchlist(list);
    state.lastRun = started.toISOString();
    state.lastTrigger = trigger;
    state.runs += 1;
    state.lastError = undefined;
    // forget alert keys older than 14 days
    const cutoff = Date.now() - 14 * 86400000;
    for (const [k, v] of Object.entries(state.alertKeys)) if (Date.parse(v) < cutoff) delete state.alertKeys[k];
    await writeState(state);

    const md =
      `# Monitoring report, ${started.toUTCString()}\n\n*Trigger: ${trigger} · ${list.length} watched regions · ${newAlerts.length} new alerts*\n\n` +
      (newAlerts.length
        ? `## New alerts\n\n${newAlerts.map((a) => `- **${a.itemName}** · ${RULE_NAME[a.rule]} · ${a.level.toUpperCase()}: ${a.message}${a.link ? ` ([data](${a.link}))` : ""} (Telegram: ${a.telegram})`).join("\n")}\n\n`
        : "## New alerts\n\nNone.\n\n") +
      (digest ? `**AI summary (our AI):** ${digest}\n\n` : "") +
      `## Checks\n\n${sections.join("\n\n")}\n\n---\n\nData: NASA POWER daily (MERRA-2), NASA EONET v3${process.env.FIRMS_MAP_KEY ? ", NASA FIRMS VIIRS" : ""}. Thresholds compare against 1991-2020 for the same calendar dates. Advisory only.`;
    const rep = await saveReport({
      kind: "monitor",
      title: `Monitoring run: ${newAlerts.length} new alert${newAlerts.length === 1 ? "" : "s"}`,
      summary: newAlerts.length ? newAlerts.slice(0, 3).map((a) => `${a.itemName}: ${RULE_NAME[a.rule]}`).join("; ") : "All quiet.",
      markdown: md,
      alerts: newAlerts.length,
    });
    return { skipped: false as const, alerts: newAlerts, reportId: rep.id, items: list.length };
  } catch (e) {
    try {
      const state = await readState();
      state.lastError = (e as Error).message;
      await writeState(state);
    } catch {
      /* the database itself may be what failed */
    }
    throw e;
  } finally {
    g.__meikaMonitorRunning = false;
  }
}

export const presetRegions = REGIONS;
