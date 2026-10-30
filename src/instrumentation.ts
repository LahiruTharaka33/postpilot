export async function register() {
  // The scheduler uses Prisma, so it only runs in the Node.js server runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./server/publisher");
    startScheduler(Number(process.env.SCHEDULER_INTERVAL_MS ?? 60_000));
  }
}
