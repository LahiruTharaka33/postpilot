/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. +330 for Asia/Colombo). */
export function tzOffsetMinutes(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Converts a wall-clock time ("2026-11-02T09:30") in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(local: string, timeZone: string) {
  const [d, t = "00:00"] = local.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  // Two passes handle times close to a daylight-saving change.
  let offset = tzOffsetMinutes(new Date(guess), timeZone);
  offset = tzOffsetMinutes(new Date(guess - offset * 60_000), timeZone);
  return new Date(guess - offset * 60_000);
}

/** Formats a UTC Date as a wall-clock "YYYY-MM-DDTHH:mm" string in `timeZone` (for datetime-local inputs). */
export function utcToZonedInput(date: Date, timeZone: string) {
  const shifted = new Date(date.getTime() + tzOffsetMinutes(date, timeZone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
];
