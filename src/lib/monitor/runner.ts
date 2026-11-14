// Monitoring run: checks every watch item, raises de-duplicated alerts, sends Telegram, writes a report.
import { REGIONS, regionById, type BBox } from "../catalog";
import { aiText } from "../ai/claude";
import { saveReport } from "../report";
import { dataPath, newId, readJSON, writeJSON } from "../store";
import { sendTelegram, telegramEnabled } from "../telegram";
import { runChecks } from "./checks";
import { DEFAULT_RULES, type Alert, type CheckResult, type MonitorState, type WatchItem, type WatchRules } from "./types";

const WATCH_FILE = dataPath("watchlist.json");
const ALERTS_FILE = dataPath("alerts.json");
const STATE_FILE = dataPath("monitor-state.json");

type G = typeof globalThis & { __meikaMonitorRunning?: boolean };
const g = globalThis as G;

function seedWatchlist(): WatchItem[] {
  const now = new Date().toISOString();
  return ["delhi-ncr", "kerala", "nw-india"].map((id) => {
    const r = regionById(id)!;
    return { id: newId("watch"), name: r.name, regionId: id, bbox: r.bbox, rules: structuredClone(DEFAULT_RULES), telegram: true, createdAt: now };
  });
}

export async function getWatchlist(): Promise<WatchItem[]> {
  const list = await readJSON<WatchItem[] | null>(WATCH_FILE, null);
  if (list) return list;
  const seeded = seedWatchlist();
  await writeJSON(WATCH_FILE, seeded);
  return seeded;
}

export async function saveWatchlist(list: WatchItem[]) {
  await writeJSON(WATCH_FILE, list);
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
  const list = await getWatchlist();
  list.push(item);
  await saveWatchlist(list);
  return item;
}

export async function removeWatchItem(id: string) {
  const list = await getWatchlist();
  await saveWatchlist(list.filter((w) => w.id !== id));
}

export async function getAlerts(limit = 200): Promise<Alert[]> {
  return (await readJSON<Alert[]>(ALERTS_FILE, [])).slice(0, limit);
}

export async function getMonitorState(): Promise<MonitorState> {
  return readJSON<MonitorState>(STATE_FILE, { runs: 0, seenEvents: {}, alertKeys: {} });
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
    const state = await getMonitorState();
    const alerts = await readJSON<Alert[]>(ALERTS_FILE, []);
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
          checks.map((c) => `| ${RULE_NAME[c.rule]} | ${c.level.toUpperCase()} | ${c.value} | ${c.detail.replace(/\|/g, "/")} |`).join("\n"),
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
          "\n\nAdvisory only. Check official warnings (IMD, NDMA or your national service).";
        const res = await sendTelegram(text);
        items.forEach((a) => (a.telegram = res.ok ? "sent" : "failed"));
      }
    }

    alerts.unshift(...newAlerts);
    await writeJSON(ALERTS_FILE, alerts.slice(0, 1000));
    await saveWatchlist(list);
    state.lastRun = started.toISOString();
    state.lastTrigger = trigger;
    state.runs += 1;
    state.lastError = undefined;
    // forget alert keys older than 14 days
    const cutoff = Date.now() - 14 * 86400000;
    for (const [k, v] of Object.entries(state.alertKeys)) if (Date.parse(v) < cutoff) delete state.alertKeys[k];
    await writeJSON(STATE_FILE, state);

    const md =
      `# Monitoring report, ${started.toUTCString()}\n\n*Trigger: ${trigger} · ${list.length} watched regions · ${newAlerts.length} new alerts*\n\n` +
      (newAlerts.length
        ? `## New alerts\n\n${newAlerts.map((a) => `- **${a.itemName}** · ${RULE_NAME[a.rule]} · ${a.level.toUpperCase()}: ${a.message} (Telegram: ${a.telegram})`).join("\n")}\n\n`
        : "## New alerts\n\nNone.\n\n") +
      (digest ? `**AI summary (Claude):** ${digest}\n\n` : "") +
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
    const state = await getMonitorState();
    state.lastError = (e as Error).message;
    await writeJSON(STATE_FILE, state);
    throw e;
  } finally {
    g.__meikaMonitorRunning = false;
  }
}

export const presetRegions = REGIONS;
