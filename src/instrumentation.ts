export async function register() {
  // On Vercel, functions do not stay up between requests; Vercel Cron calls /api/monitor/run instead (vercel.json).
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startScheduler } = await import("./lib/monitor/scheduler");
    startScheduler();
  }
}
