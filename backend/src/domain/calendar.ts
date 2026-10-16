/** Colombia is UTC−5 all year (no daylight saving time), so a fixed offset is exact. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar date in Bogotá, as YYYY-MM-DD. */
export function bogotaDay(date: Date): string {
  return new Date(date.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant the Bogotá calendar day containing `date` began. */
export function startOfBogotaDay(date: Date): Date {
  const local = date.getTime() - BOGOTA_OFFSET_MS;
  return new Date(local - (local % DAY_MS) + BOGOTA_OFFSET_MS);
}

/** The last `count` Bogotá dates up to and including today, oldest first. */
export function lastBogotaDays(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    bogotaDay(new Date(now.getTime() - (count - 1 - i) * DAY_MS)),
  );
}
