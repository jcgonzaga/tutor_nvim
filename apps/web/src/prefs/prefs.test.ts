import { describe, expect, it } from "vitest";
import { memoryStorage } from "../storage/profileStore";
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  loadPrefs,
  savePrefs,
  withAnalytics,
  withLanguage,
  withLayer,
  withLessonSeen,
} from "./prefs";
import { CUES, cueFor } from "./sound";

describe("preferences", () => {
  it("start off: no sound, no usage data", () => {
    expect(loadPrefs(memoryStorage())).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toMatchObject({ sound: false, analytics: false });
  });

  it("are remembered", () => {
    const storage = memoryStorage();
    const prefs = {
      ...DEFAULT_PREFS,
      sound: true,
      language: "en" as const,
      seenLessons: ["vim-operator-change"],
    };
    expect(savePrefs(storage, prefs)).toBe(true);
    expect(loadPrefs(storage)).toEqual(prefs);
  });

  it("remember which tool layers were enabled, in the order they were turned on (S1)", () => {
    const storage = memoryStorage();
    const one = withLayer(DEFAULT_PREFS, "nvim", true);
    const two = withLayer(one, "tmux", true);
    expect(two.enabledLayers).toEqual(["nvim", "tmux"]);
    // Turning on a layer that is already on changes nothing, so React sees the same object.
    expect(withLayer(two, "nvim", true)).toBe(two);
    expect(savePrefs(storage, two)).toBe(true);
    expect(loadPrefs(storage).enabledLayers).toEqual(["nvim", "tmux"]);
    // And turning one off leaves the rest, so a reload cannot bring it back.
    const off = withLayer(loadPrefs(storage), "nvim", false);
    expect(savePrefs(storage, off)).toBe(true);
    expect(loadPrefs(storage).enabledLayers).toEqual(["tmux"]);
  });

  it("keep no layer enabled when the stored set is not a layer list", () => {
    const storage = memoryStorage();
    storage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, enabledLayers: ["Nvim"] }));
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    storage.setItem(
      PREFS_KEY,
      JSON.stringify({ ...DEFAULT_PREFS, enabledLayers: ["tmux", "tmux"] }),
    );
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
  });

  it("fall back to the defaults when the stored value is damaged", () => {
    const storage = memoryStorage();
    storage.setItem(PREFS_KEY, "{nope");
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    storage.setItem(
      PREFS_KEY,
      JSON.stringify({ sound: "yes", analytics: 1, installId: 3, language: "fr" }),
    );
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
  });

  it("load from before language and lessons existed, with Spanish and no lessons seen", () => {
    const storage = memoryStorage();
    storage.setItem(PREFS_KEY, JSON.stringify({ sound: true, analytics: false, installId: null }));
    expect(loadPrefs(storage)).toEqual({ ...DEFAULT_PREFS, sound: true });
    expect(DEFAULT_PREFS.language).toBe("es");
  });

  it("remember a lesson as seen once, and a language change", () => {
    const seen = withLessonSeen(DEFAULT_PREFS, "vim-undo");
    expect(seen.seenLessons).toEqual(["vim-undo"]);
    expect(withLessonSeen(seen, "vim-undo")).toBe(seen);
    expect(withLanguage(seen, "en")).toMatchObject({ language: "en", seenLessons: ["vim-undo"] });
  });

  it("create an install id when analytics is allowed, keep it, and forget it when turned off", () => {
    const on = withAnalytics(DEFAULT_PREFS, true, () => "install-12345678");
    expect(on).toMatchObject({ analytics: true, installId: "install-12345678" });
    expect(withAnalytics(on, true, () => "another-87654321").installId).toBe("install-12345678");
    expect(withAnalytics(on, false, () => "x")).toMatchObject({
      analytics: false,
      installId: null,
    });
  });
});

describe("sound cues", () => {
  it("picks a cue from the feedback", () => {
    expect(cueFor("perfect")).toBe("perfect");
    expect(cueFor("failed")).toBe("fail");
    expect(cueFor("completed")).toBe("success");
  });

  it("keeps every cue short and quiet in spirit", () => {
    for (const notes of Object.values(CUES)) {
      const total = notes.reduce((sum, [, ms]) => sum + ms, 0);
      expect(total).toBeLessThanOrEqual(500);
    }
  });
});
