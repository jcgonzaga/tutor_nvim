import { describe, expect, it } from "vitest";
import {
  EMPTY_COMBO,
  EMPTY_GAMIFICATION,
  PROFILE_VERSION,
  addXp,
  createProfile,
  recordCompletedDay,
  rememberBestRun,
  startSession,
  type DailySession,
  type Profile,
} from "@tutor-nvim/pedagogy";
import { PROFILE_KEY, loadProfile, memoryStorage, saveProfile } from "./profileStore";

const T0 = Date.UTC(2026, 9, 21, 9);
const plan: DailySession = {
  userId: "u",
  date: "2026-10-21",
  seed: "",
  warmup: [],
  reviews: [],
  learn: [{ exerciseId: "ex-a", skillId: "vim.a", block: "learn", reason: "t" }],
  mixed: [],
  challenge: [],
};

/** A profile as the M5/M6 build stored it: version 1, no game layer. */
function asVersion1(profile: Profile): Record<string, unknown> {
  const { gamification: _game, activeSession, ...rest } = profile;
  void _game;
  return {
    ...rest,
    version: 1,
    activeSession: activeSession && { run: activeSession.run, startedAt: activeSession.startedAt },
  };
}

describe("profile migration v1 → v2 (M8)", () => {
  it("is the current version", () => {
    expect(PROFILE_VERSION).toBe(2);
  });

  it("adds an empty game layer to a stored version-1 profile and keeps everything else", () => {
    const old = createProfile("legacy", T0);
    const storage = memoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify(asVersion1(old)));

    const result = loadProfile(storage);
    expect(result.status).toBe("loaded");
    if (result.status !== "loaded") return;
    expect(result.profile).toEqual(old);
    expect(result.profile.gamification).toEqual(EMPTY_GAMIFICATION);
    expect(result.profile.version).toBe(2);
  });

  it("gives a session that was in play a fresh combo and no rewards yet", () => {
    const old = startSession(createProfile("legacy", T0), plan, T0);
    const storage = memoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify(asVersion1(old)));

    const result = loadProfile(storage);
    expect(result.status).toBe("loaded");
    if (result.status !== "loaded") return;
    expect(result.profile.activeSession).toMatchObject({ combo: EMPTY_COMBO, rewards: null });
    expect(result.profile.activeSession?.run).toEqual(old.activeSession?.run);
  });

  it("still refuses a version it does not know, keeping the data", () => {
    const storage = memoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify({ ...createProfile("u", T0), version: 3 }));
    expect(loadProfile(storage).status).toBe("unreadable");
    expect(storage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("does not turn a damaged version-1 profile into a valid one", () => {
    const storage = memoryStorage();
    storage.setItem(
      PROFILE_KEY,
      JSON.stringify({ ...asVersion1(createProfile("u", T0)), history: "nope" }),
    );
    expect(loadProfile(storage).status).toBe("unreadable");
  });
});

describe("the game layer is stored and read back", () => {
  it("round-trips XP, streak, records and best runs", () => {
    let profile = createProfile("u", T0);
    let gamification = addXp(profile.gamification, "2026-10-21", 40, true);
    gamification = addXp(gamification, "2026-10-21", 20, false);
    gamification = {
      ...gamification,
      streak: recordCompletedDay(gamification.streak, "2026-10-21"),
      bestCombo: 6,
      recentBests: [{ exerciseId: "ex-a", metrics: ["time", "efficiency"], at: T0 }],
    };
    gamification = rememberBestRun(gamification, "ex-a", {
      keys: ["c", "i", '"', "<Esc>"],
      times: [90, 180, 260, 400],
      durationMs: 400,
      performance: 88,
      at: T0,
    });
    profile = { ...profile, gamification };

    const storage = memoryStorage();
    expect(saveProfile(storage, profile)).toBe(true);
    expect(loadProfile(storage)).toEqual({ status: "loaded", profile });
  });

  it("rejects absurd stored values instead of trusting them", () => {
    const profile = createProfile("u", T0);
    const storage = memoryStorage();
    storage.setItem(
      PROFILE_KEY,
      JSON.stringify({ ...profile, gamification: { ...profile.gamification, xp: -5 } }),
    );
    expect(loadProfile(storage).status).toBe("unreadable");
  });
});
