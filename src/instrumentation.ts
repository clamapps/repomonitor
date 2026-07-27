export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const globalState = globalThis as unknown as { repoMonitorCron?: boolean };
  if (globalState.repoMonitorCron) return;
  globalState.repoMonitorCron = true;

  const cron = await import("node-cron");
  const { runPollingCycle } = await import("@/lib/polling/run");
  cron.schedule(
    process.env.POLL_CRON || "17 3 * * *",
    () => {
      void runPollingCycle("scheduled").catch((error) => {
        console.error("Scheduled repository poll failed", error);
      });
    },
    {
      timezone: process.env.POLL_TIMEZONE || "UTC",
      noOverlap: true,
    },
  );
}
