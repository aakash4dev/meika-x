// One monitoring run from the command line (for system cron): npm run monitor
import { runMonitor } from "../src/lib/monitor/runner";

runMonitor("cli")
  .then((r) => {
    if (r.skipped) console.log(r.reason);
    else console.log(`Checked ${r.items} regions, ${r.alerts.length} new alert(s). Report: ${r.reportId}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Monitoring run failed:", e);
    process.exit(1);
  });
