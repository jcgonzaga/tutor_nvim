import { PROFILE_KEY, memoryStorage, type KeyValueStorage } from "./profileStore";

/**
 * The browser's `localStorage`, or in-memory storage when access is blocked (some privacy modes
 * and sandboxed frames throw on first touch). The app still works; progress just won't survive a reload.
 */
export function browserStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage;
    storage.getItem(PROFILE_KEY);
    return storage;
  } catch {
    return memoryStorage();
  }
}
