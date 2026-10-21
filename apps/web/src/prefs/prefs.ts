import { z } from "zod";
import type { KeyValueStorage } from "../storage/profileStore";

/**
 * Device preferences (T-901, T-903). They are about this browser, not about the learner's progress,
 * so they live apart from the profile and are never synced.
 *
 * Both default to off: sound only plays when asked for (AGENTS 19), and usage data is only sent
 * with consent.
 */
export interface Prefs {
  readonly sound: boolean;
  readonly analytics: boolean;
  /** Random, per browser, created when analytics is first allowed; unrelated to any account. */
  readonly installId: string | null;
}

export const DEFAULT_PREFS: Prefs = { sound: false, analytics: false, installId: null };
export const PREFS_KEY = "tutor-nvim:prefs";

const prefsSchema = z.object({
  sound: z.boolean(),
  analytics: z.boolean(),
  installId: z.string().min(8).max(100).nullable(),
});

export function loadPrefs(storage: KeyValueStorage): Prefs {
  try {
    const text = storage.getItem(PREFS_KEY);
    if (text === null) return DEFAULT_PREFS;
    const parsed = prefsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(storage: KeyValueStorage, prefs: Prefs): boolean {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** Allowing analytics creates the install id; turning it off forgets it, so nothing links later data to earlier. */
export function withAnalytics(prefs: Prefs, allowed: boolean, newId: () => string): Prefs {
  if (!allowed) return { ...prefs, analytics: false, installId: null };
  return { ...prefs, analytics: true, installId: prefs.installId ?? newId() };
}
