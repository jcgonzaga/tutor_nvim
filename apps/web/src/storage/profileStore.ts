import {
  EMPTY_COMBO,
  EMPTY_GAMIFICATION,
  PROFILE_VERSION,
  type Profile,
} from "@tutor-nvim/pedagogy";
import { profileSchema } from "./profileSchema";

/** The slice of `Storage` the app uses, so tests can pass a plain in-memory object. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROFILE_KEY = "tutor-nvim:profile";
/** A profile that could not be read is kept here instead of being overwritten or lost. */
export const CORRUPT_PROFILE_KEY = "tutor-nvim:profile:unreadable";

export type LoadResult =
  | { readonly status: "empty" }
  | { readonly status: "loaded"; readonly profile: Profile }
  /** Stored data exists but is unusable (corrupt, or written by a newer build). Kept as a backup. */
  | { readonly status: "unreadable"; readonly reason: string };

/**
 * Brings a stored profile up to `PROFILE_VERSION`, one explicit step per version (AGENTS 10).
 * Returns `null` for a version this build cannot read (corrupt, or written by a newer build).
 *
 * - v1 → v2 (M8): adds the game layer. Nothing is back-dated: XP, streak and records start at
 *   zero, and a session already in play starts its combo at 0.
 */
export function migrateProfile(raw: unknown): unknown | null {
  if (typeof raw !== "object" || raw === null) return null;
  let current = raw as Record<string, unknown>;
  if (current.version === 1) current = migrateV1(current);
  return current.version === PROFILE_VERSION ? current : null;
}

function migrateV1(profile: Record<string, unknown>): Record<string, unknown> {
  const active = profile.activeSession;
  return {
    ...profile,
    version: 2,
    gamification: EMPTY_GAMIFICATION,
    activeSession:
      typeof active === "object" && active !== null
        ? { ...active, combo: EMPTY_COMBO, rewards: null }
        : null,
  };
}

export function loadProfile(storage: KeyValueStorage): LoadResult {
  let text: string | null;
  try {
    text = storage.getItem(PROFILE_KEY);
  } catch {
    return { status: "unreadable", reason: "Storage is not available" };
  }
  if (text === null) return { status: "empty" };

  const fail = (reason: string): LoadResult => {
    try {
      storage.setItem(CORRUPT_PROFILE_KEY, text);
      storage.removeItem(PROFILE_KEY);
    } catch {
      // Backing it up is best effort; the reason is still reported.
    }
    return { status: "unreadable", reason };
  };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("Stored profile is not valid JSON");
  }
  const migrated = migrateProfile(raw);
  if (migrated === null) return fail("Stored profile has an unknown version");
  const parsed = profileSchema.safeParse(migrated);
  if (!parsed.success) return fail("Stored profile does not match the expected format");
  return { status: "loaded", profile: parsed.data };
}

/** `false` when the browser refused the write (private mode, quota); the caller keeps playing. */
export function saveProfile(storage: KeyValueStorage, profile: Profile): boolean {
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function clearProfile(storage: KeyValueStorage): void {
  try {
    storage.removeItem(PROFILE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** Storage that lives only as long as the page; the fallback when the browser blocks `localStorage`. */
export function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}
