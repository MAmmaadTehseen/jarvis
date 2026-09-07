/**
 * Date helpers. Dates are plain "YYYY-MM-DD" strings in the user's timezone.
 * No date library: the bot needs exactly these five operations.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DayInfo {
  date: string;
  weekday: Weekday;
  weekdayName: (typeof WEEKDAYS)[number];
}

/** Today's date and weekday in the given IANA timezone. */
export function dayInfo(tz: string, at: Date = new Date()): DayInfo {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) p[part.type] = part.value;
  const weekdayName = p.weekday as (typeof WEEKDAYS)[number];
  const weekday = WEEKDAYS.indexOf(weekdayName) as Weekday;
  return { date: `${p.year}-${p.month}-${p.day}`, weekday, weekdayName };
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Bad date: ${date}`);
  return [y, m - 1, d];
}

export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(...parts(from));
  const b = Date.UTC(...parts(to));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m, d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m, d)).getUTCDay() as Weekday;
}

/** Week 1 starts on START_DATE (a Monday). Anything before it is week 0. */
export function weekNumber(startDate: string, date: string): number {
  const diff = daysBetween(startDate, date);
  return diff < 0 ? 0 : Math.floor(diff / 7) + 1;
}

/** Day N of the journey, 1-based from START_DATE. 0 before the start. */
export function dayNumber(startDate: string, date: string): number {
  const diff = daysBetween(startDate, date);
  return diff < 0 ? 0 : diff + 1;
}

/** Monday of the given week number (week 0 is the week before START_DATE). */
export function weekStart(startDate: string, week: number): string {
  return addDays(startDate, (week - 1) * 7);
}
