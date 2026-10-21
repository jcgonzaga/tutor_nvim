export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(Math.max(value, min), max);

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** Exponential moving average: `alpha` is the weight of the new sample. */
export const ema = (current: number, sample: number, alpha: number): number =>
  current + alpha * (sample - current);
