// In-process scheduler for active monitoring (started from instrumentation.ts on the Node.js runtime).
// For serverless hosting, call GET /api/monitor/run?secret=CRON_SECRET from an external cron instead.
import { runMonitor } from "./runner";

type G = typeof globalThis & { __meikaScheduler?: NodeJS.Timeout; __meikaSchedulerInfo?: { intervalMin: number; startedAt: string } };
const g = globalThis as G;

export function schedulerInfo() {
  return g.__meikaSchedulerInfo ?? null;
}

export function startScheduler() {
  const minutes = Number(process.env.MONITOR_INTERVAL_MINUTES ?? 60);
  if (!(minutes > 0) || g.__meikaScheduler) return;
  const tick = () =>
    runMonitor("scheduler").catch((e) => console.error("[monitor] scheduled run failed:", (e as Error).message));
  g.__meikaSchedulerInfo = { intervalMin: minutes, startedAt: new Date().toISOString() };
  setTimeout(tick, 60_000); // first run one minute after start
  g.__meikaScheduler = setInterval(tick, minutes * 60_000);
  console.log(`[monitor] scheduler on: every ${minutes} min`);
}
