import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { T0, createTestApi, exerciseNamed, gaveUp, newId, solved, type TestApi } from "./test-util";

let api: TestApi;
beforeAll(async () => {
  api = await createTestApi();
});
afterAll(async () => api.close());

const NORMAL = "vim.mode-normal.basic-001";
const NORMAL2 = "vim.mode-normal.basic-002";
const NORMAL3 = "vim.mode-normal.basic-003";
const DAY = "2026-10-21";

const upload = (user: string, attempts: unknown[]) =>
  api.request("POST", "/api/attempts", { user, body: { attempts } });
const progress = async (user: string) => (await api.request("GET", "/api/progress", { user })).body;
const session = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  date,
  startedAt: T0,
  finishedAt: T0 + 1000,
  items: [],
  ...extra,
});

describe("the server recomputes XP and combo (ADR-0003 §9)", () => {
  it("awards XP to attempts of a daily session only, and says how much", async () => {
    const sessionId = newId();
    const inSession = solved(exerciseNamed(NORMAL), { finishedAt: T0, sessionId, localDay: DAY });
    const free = solved(exerciseNamed(NORMAL2), { finishedAt: T0 + 1000, localDay: DAY });
    const { body } = await upload("xp-1", [inSession, free]);

    expect(body.results[0]).toMatchObject({ xp: 15, success: true });
    expect(body.results[1]).toMatchObject({ xp: 0, success: true });
    expect((await progress("xp-1")).gamification.xp).toBe(15);
  });

  it("never reads an XP figure from the client", async () => {
    const sessionId = newId();
    const attempt = {
      ...solved(exerciseNamed(NORMAL), { finishedAt: T0, sessionId, localDay: DAY }),
      xp: 9999,
      combo: 50,
    };
    const { body } = await upload("xp-2", [attempt]);
    expect(body.results[0].xp).toBe(15);
    expect((await progress("xp-2")).gamification.xp).toBe(15);
  });

  it("builds the session's combo from its attempts and resets it on a failure", async () => {
    const sessionId = newId();
    const a = (slug: string, at: number) =>
      solved(exerciseNamed(slug), { finishedAt: T0 + at, sessionId, localDay: DAY });
    const result = await upload("xp-3", [
      a(NORMAL, 0),
      a(NORMAL2, 1000),
      gaveUp(exerciseNamed(NORMAL3), { finishedAt: T0 + 2000, sessionId, localDay: DAY }),
      a("vim.navigation-atomic.basic-001", 3000),
    ]);
    expect(result.status).toBe(200);
    const game = (await progress("xp-3")).gamification;
    expect(game.bestCombo).toBe(2);
    // Combo ×2 pays a little more than ×1 (15 → 16 or more), the failure earns 0.
    const xps = result.body.results.map((r: { xp: number }) => r.xp);
    expect(xps[1]).toBeGreaterThan(xps[0]);
    expect(xps[2]).toBe(0);
  });

  it("pays less when the same exercise is solved again on the same local day, in full on the next", async () => {
    const sessionId = newId();
    const make = (at: number, localDay: string) =>
      solved(exerciseNamed(NORMAL), { finishedAt: T0 + at, sessionId, localDay });
    const { body } = await upload("xp-4", [
      make(0, DAY),
      make(1000, DAY),
      make(86_400_000, "2026-10-22"),
    ]);
    const [first, second, nextDay] = body.results.map((r: { xp: number }) => r.xp);
    expect(second).toBeLessThan(first);
    expect(nextDay).toBeGreaterThanOrEqual(first);
  });

  it("uses the UTC day when the client sent none", async () => {
    const sessionId = newId();
    const a = solved(exerciseNamed(NORMAL), { finishedAt: T0, sessionId });
    const b = solved(exerciseNamed(NORMAL), { finishedAt: T0 + 1000, sessionId });
    const { body } = await upload("xp-5", [a, b]);
    expect(body.results[1].xp).toBeLessThan(body.results[0].xp);
  });

  it("is idempotent: a retried upload does not pay twice", async () => {
    const attempt = solved(exerciseNamed(NORMAL), {
      finishedAt: T0,
      sessionId: newId(),
      localDay: DAY,
    });
    await upload("xp-6", [attempt]);
    const again = await upload("xp-6", [attempt]);
    expect(again.body.results[0]).toMatchObject({ duplicate: true, xp: 15 });
    expect((await progress("xp-6")).gamification.xp).toBe(15);
  });

  it("keeps XP out of mastery: the learner is the same with and without a session", async () => {
    const withSession = solved(exerciseNamed(NORMAL), {
      finishedAt: T0,
      sessionId: newId(),
      localDay: DAY,
    });
    const without = solved(exerciseNamed(NORMAL), { finishedAt: T0, localDay: DAY });
    await upload("xp-7a", [withSession]);
    await upload("xp-7b", [without]);
    expect((await progress("xp-7a")).learner).toEqual((await progress("xp-7b")).learner);
  });
});

describe("daily bonus and streak from completed sessions", () => {
  const post = (user: string, body: unknown) =>
    api.request("POST", "/api/sessions", { user, body });

  it("pays the daily bonus once per local day, and not for abandoned or unfinished sessions", async () => {
    await post("day-1", session(newId(), DAY, { abandoned: true }));
    await post("day-1", session(newId(), DAY, { finishedAt: null }));
    expect((await progress("day-1")).gamification.xp).toBe(0);

    await post("day-1", session(newId(), DAY));
    expect((await progress("day-1")).gamification.xp).toBe(20);
    await post("day-1", session(newId(), DAY));
    expect((await progress("day-1")).gamification.xp).toBe(20);
    await post("day-1", session(newId(), "2026-10-22"));
    expect((await progress("day-1")).gamification.xp).toBe(40);
  });

  it("does not pay twice when the same session is sent again", async () => {
    const id = newId();
    await post("day-2", session(id, DAY));
    await post("day-2", session(id, DAY));
    expect((await progress("day-2")).gamification.xp).toBe(20);
  });

  it("replays the streak over the completed days: consecutive, forgiven gap, then a new streak", async () => {
    for (const date of ["2026-10-20", "2026-10-21", "2026-10-23"]) {
      await post("day-3", session(newId(), date));
    }
    expect((await progress("day-3")).gamification.streak).toEqual({
      current: 3,
      longest: 3,
      lastDay: "2026-10-23",
    });
    await post("day-3", session(newId(), "2026-11-05"));
    expect((await progress("day-3")).gamification.streak).toEqual({
      current: 1,
      longest: 3,
      lastDay: "2026-11-05",
    });
  });

  it("counts a day once, however many sessions it had", async () => {
    await post("day-4", session(newId(), DAY));
    await post("day-4", session(newId(), DAY));
    expect((await progress("day-4")).gamification.streak.current).toBe(1);
  });

  it("puts the session's XP, bonus included, in its history entry", async () => {
    const sessionId = newId();
    const attempt = solved(exerciseNamed(NORMAL), { finishedAt: T0, sessionId, localDay: DAY });
    await upload("day-5", [attempt]);
    await post(
      "day-5",
      session(sessionId, DAY, {
        items: [
          {
            exerciseId: attempt.exerciseId,
            skillId: "vim.mode.normal",
            block: "learn",
            reason: "t",
            position: 0,
          },
        ],
      }),
    );
    const entry = (await progress("day-5")).sessions[0];
    expect(entry.xp).toBe(15 + 20);
  });
});

describe("records the server derives", () => {
  it("returns the best run of each exercise as a replayable run, relative to its start", async () => {
    const exercise = exerciseNamed("vim.ci-quotes.basic-001");
    const attempt = solved(exercise, { finishedAt: T0, sessionId: newId(), localDay: DAY });
    await upload("rec-1", [attempt]);
    const run = (await progress("rec-1")).gamification.bestRuns[exercise.id];
    expect(run.keys.join("")).toBe(
      exercise.solutions.find((s) => s.classification === "optimal")?.keys.join(""),
    );
    expect(run.times).toHaveLength(run.keys.length);
    expect(run.times[0]).toBeGreaterThan(0);
    expect([...run.times].sort((a, b) => a - b)).toEqual(run.times);
    expect(run.performance).toBeGreaterThan(0);
  });

  it("keeps the better of two runs", async () => {
    const exercise = exerciseNamed("vim.ci-quotes.basic-001");
    const optimal = solved(exercise, { finishedAt: T0, localDay: DAY });
    const clumsy = {
      ...solved(exercise, { finishedAt: T0 + 1000, localDay: DAY }),
      events: [
        { key: "i", timestamp: 100 },
        { key: "Escape", timestamp: 200 },
        ...solved(exercise, { finishedAt: 0 }).events.map((e) => ({
          ...e,
          timestamp: e.timestamp + 300,
        })),
      ],
    };
    await upload("rec-2", [optimal, clumsy]);
    const run = (await progress("rec-2")).gamification.bestRuns[exercise.id];
    expect(run.keys.length).toBe(optimal.events.length);
  });

  it("lists the latest personal bests", async () => {
    const exercise = exerciseNamed(NORMAL);
    const slow = solved(exercise, { finishedAt: T0, localDay: DAY });
    const fast = {
      ...solved(exercise, { finishedAt: T0 + 1000, localDay: DAY }),
      events: [{ key: "Escape", timestamp: 50 }],
    };
    await upload("rec-3", [slow, fast]);
    const bests = (await progress("rec-3")).gamification.recentBests;
    expect(bests.at(-1)).toMatchObject({ exerciseId: exercise.id });
    expect(bests.at(-1).metrics.length).toBeGreaterThan(0);
  });

  it("never mixes one user's XP or records into another's", async () => {
    await upload("iso-1", [
      solved(exerciseNamed(NORMAL), { finishedAt: T0, sessionId: newId(), localDay: DAY }),
    ]);
    const other = (await progress("iso-2")).gamification;
    expect(other.xp).toBe(0);
    expect(other.bestRuns).toEqual({});
  });
});

describe("adopting the game layer earned before sync", () => {
  it("adds the server's own totals on top of the baseline, and refuses it twice", async () => {
    const legacy = {
      learner: { skills: {} },
      personalBests: {},
      gamification: {
        xp: 200,
        bestCombo: 6,
        streak: { current: 5, longest: 8, lastDay: "2026-10-20" },
      },
    };
    const imported = await api.request("POST", "/api/progress/import", {
      user: "leg-1",
      body: legacy,
    });
    expect(imported.status).toBe(201);
    expect((await progress("leg-1")).gamification).toMatchObject({ xp: 200, bestCombo: 6 });

    await upload("leg-1", [
      solved(exerciseNamed(NORMAL), { finishedAt: T0, sessionId: newId(), localDay: DAY }),
    ]);
    await api.request("POST", "/api/sessions", {
      user: "leg-1",
      body: session(newId(), "2026-10-21"),
    });
    const game = (await progress("leg-1")).gamification;
    expect(game.xp).toBe(200 + 15 + 20);
    // The streak continues from the imported one: 5 on the 20th, 6 on the 21st.
    expect(game.streak).toMatchObject({ current: 6, longest: 8, lastDay: "2026-10-21" });

    const again = await api.request("POST", "/api/progress/import", {
      user: "leg-1",
      body: legacy,
    });
    expect(again.status).toBe(409);
  });

  it("rejects absurd baselines", async () => {
    const absurd = {
      learner: { skills: {} },
      personalBests: {},
      gamification: { xp: -5, bestCombo: 0, streak: { current: 0, longest: 0, lastDay: null } },
    };
    expect(
      (await api.request("POST", "/api/progress/import", { user: "leg-2", body: absurd })).status,
    ).toBe(400);
  });
});
