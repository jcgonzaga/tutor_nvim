/**
 * The app's source of "now" (epoch ms). Domain code never reads the clock; the web layer passes
 * `clock.now()` in, so review scheduling can be tested by moving time (E2E uses Playwright's
 * `page.clock`, which this reads through `Date.now()`).
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** Local calendar day, `YYYY-MM-DD`: the key that identifies "today's" session. */
export function localDateKey(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
