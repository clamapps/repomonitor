export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const globalState = globalThis as unknown as { repoMonitorCron?: boolean };
  if (globalState.repoMonitorCron) return;
  globalState.repoMonitorCron = true;

  const cron = await import("node-cron");
  const { pollIsOverdue, runPollingCycle } = await import("@/lib/polling/run");

  // A restart spanning the scheduled time would otherwise skip a whole day.
  const catchUp = setTimeout(async () => {
    try {
      if (await pollIsOverdue()) await runPollingCycle("scheduled");
    } catch (error) {
      console.error("Catch-up repository poll failed", error);
    }
  }, 60_000);
  catchUp.unref?.();

  cron.schedule(
    process.env.POLL_CRON || "17 3 * * *",
    async () => {
      try {
        await runPollingCycle("scheduled");
      } catch (error) {
        console.error("Scheduled repository poll failed", error);
      }
    },
    {
      timezone: process.env.POLL_TIMEZONE || "UTC",
      noOverlap: true,
    },
  );
}
