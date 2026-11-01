// Keep-alive address for an uptime or cron service. Never touches the database, so calling it
// every minute keeps the web service awake while the database can still sleep.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
