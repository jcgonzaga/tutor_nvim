import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeFeedback,
  evaluateAttempt,
  runOf,
  simulateSolution,
  startAttempt,
  type Attempt,
} from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import {
  DAY_MS,
  buildDailySession,
  completeOnboarding,
  completeSessionItem,
  createProfile,
  currentItem,
  endSession,
  finishAttempt,
  startSession,
  type Profile,
} from "@tutor-nvim/pedagogy";
import { fakeToken } from "../apps/api/src/auth/fake";
import { bundle, createTestApi, T0, type TestApi } from "../apps/api/src/test-util";
import { createCloudApi } from "../apps/web/src/cloud/api";
import {
  EMPTY_OUTBOX,
  enqueueAttempt,
  enqueueSession,
  type Outbox,
} from "../apps/web/src/cloud/outbox";
import {
  sessionIdOf,
  toAttemptSubmission,
  toSessionSubmission,
} from "../apps/web/src/cloud/submission";
import { runSync } from "../apps/web/src/cloud/sync";

const { skills, exercises } = bundle;
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

let api: TestApi;
beforeEach(async () => {
  api = await createTestApi();
});
afterEach(async () => api.close());

function fetchInto(testApi: TestApi): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const response = await testApi.app.inject({
      method: (init?.method ?? "GET") as "GET" | "POST" | "PUT",
      url: `${url.pathname}${url.search}`,
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body ? { payload: String(init.body) } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const exerciseOf = (id: string): Exercise => {
  const found = byId.get(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

/** What the learner does in one exercise: solves it best, solves it clumsily, or gives up. */
type Move = "best" | "give-up" | "hint";

function attemptFor(exercise: Exercise, move: Move): Attempt {
  const optimal = exercise.solutions.find((s) => s.classification === "optimal");
  if (!optimal) throw new Error("no optimal solution");
  if (move === "give-up") return { ...startAttempt(exercise, 0), completedAt: 4000 };
  const attempt = simulateSolution(exercise, optimal, { stepMs: 150 });
  // A strong hint (level 2) was used on the way: the combo must break and the XP shrink.
  return move === "hint"
    ? {
        ...attempt,
        hints: [
          { level: 1, timestamp: 100 },
          { level: 2, timestamp: 200 },
        ],
      }
    : attempt;
}

/** A device that plays daily sessions exactly like the web app: game layer first, then the outbox. */
class Device {
  profile: Profile = completeOnboarding(createProfile("local", T0), skills, null, T0);
  outbox: Outbox = EMPTY_OUTBOX;
  readonly cloud = createCloudApi({
    baseUrl: "http://api.test",
    token: async () => fakeToken("parity"),
    fetch: fetchInto(api),
  });

  playDay(day: number, moves: Move[]): void {
    const now = T0 + day * DAY_MS;
    const date = dayOf(now);
    const plan = buildDailySession({
      userId: this.profile.userId,
      date,
      now,
      skills,
      exercises,
      learner: this.profile.learner,
      history: this.profile.history,
    });
    this.profile = startSession(this.profile, plan, now);
    const options = {
      exerciseIdsForSkill: (skillId: string) =>
        exercises.filter((e) => e.skillIds.includes(skillId)).map((e) => e.id),
      skillsOf: (id: string) => exerciseOf(id).skillIds,
    };
    let at = now;
    for (let index = 0; index < 60; index++) {
      const active = this.profile.activeSession;
      const item = active ? currentItem(active.run) : null;
      if (!active || !item) break;
      const exercise = exerciseOf(item.exerciseId);
      const move = moves[index] ?? "best";
      const attempt = attemptFor(exercise, move);
      const evaluation = evaluateAttempt(exercise, attempt);
      at += 60_000;
      const sessionId = sessionIdOf(this.profile, active);
      this.outbox = enqueueAttempt(
        this.outbox,
        toAttemptSubmission(exercise, attempt, {
          id: crypto.randomUUID(),
          finishedAt: at,
          solved: evaluation.success,
          sessionId,
          localDay: dayOf(at),
        }),
      );
      const run = runOf(attempt);
      const result = finishAttempt(
        this.profile,
        skills,
        { exercise, metrics: evaluation.metrics, at },
        {
          feedback: describeFeedback(exercise, attempt, evaluation).kind,
          strategy: evaluation.strategy,
          maxHintLevel: attempt.hints.reduce((h, x) => Math.max(h, x.level), 0),
          antiPatterns: evaluation.antiPatterns.length,
          run: { ...run, performance: evaluation.metrics.performanceScore, at },
          day: dayOf(at),
          dayOf,
          inSession: true,
        },
      );
      this.profile = completeSessionItem(
        result.profile,
        {
          success: evaluation.success,
          performance: evaluation.metrics.performanceScore,
          at,
          scheduledReview: result.updates.some((u) => u.scheduledReview),
          improved: result.improved,
          xp: result.award.total,
          skillUpdates: result.updates,
        },
        options,
      );
    }
    const closing = this.profile.activeSession;
    if (closing) {
      this.outbox = enqueueSession(
        this.outbox,
        toSessionSubmission(this.profile, closing, { finishedAt: at, abandoned: false }),
      );
    }
    this.profile = endSession(this.profile, at, false);
  }

  sync() {
    // The server's clock is "now", after everything this device did (it clamps future-dated attempts).
    api.clock.now = T0 + 30 * DAY_MS;
    return runSync({
      api: this.cloud,
      getProfile: () => this.profile,
      getOutbox: () => this.outbox,
      setOutbox: (outbox) => {
        this.outbox = outbox;
      },
      updateProfile: (transition) => {
        this.profile = transition(this.profile);
      },
    });
  }
}

describe("the server recomputes exactly what the device showed (ADR-0003 §9)", () => {
  it("agrees on XP, level inputs, streak, combo, best runs and recent bests over several days", async () => {
    const device = new Device();
    // Day 0: all good. Day 1: a failure and a hint mid-session. Day 3: one missed day (forgiven).
    // Day 4: a repeat session of the same day is not played; day 9: a long gap starts a new streak.
    device.playDay(0, []);
    device.playDay(1, ["best", "give-up", "best", "hint", "best"]);
    device.playDay(3, []);
    device.playDay(9, ["best", "best", "give-up"]);

    const local = device.profile.gamification;
    expect(local.xp).toBeGreaterThan(0);
    expect(local.streak).toMatchObject({ current: 1, longest: 3 });

    const outcome = await device.sync();
    expect(outcome).toEqual({ status: "synced", rejected: 0 });

    // Applying the snapshot replaced the local numbers with the server's recomputation: identical.
    const synced = device.profile.gamification;
    expect(synced.xp).toBe(local.xp);
    expect(synced.xpByDay).toEqual(local.xpByDay);
    expect(synced.streak).toEqual(local.streak);
    expect(synced.bestCombo).toBe(local.bestCombo);
    expect(synced.recentBests).toEqual(local.recentBests);
    expect(Object.keys(synced.bestRuns).sort()).toEqual(Object.keys(local.bestRuns).sort());
    for (const [id, run] of Object.entries(local.bestRuns)) {
      expect(synced.bestRuns[id], id).toEqual(run);
    }
  });

  it("a second device receives the account's XP, streak and best runs", async () => {
    const first = new Device();
    first.playDay(0, []);
    first.playDay(1, []);
    await first.sync();

    const second = new Device();
    await second.sync();
    expect(second.profile.gamification.xp).toBe(first.profile.gamification.xp);
    expect(second.profile.gamification.streak).toEqual(first.profile.gamification.streak);
    expect(Object.keys(second.profile.gamification.bestRuns).length).toBeGreaterThan(0);
  });

  it("the learner is still the learner the plain learning path would give (XP never touches it)", async () => {
    const device = new Device();
    device.playDay(0, []);
    device.playDay(1, ["best", "hint", "give-up"]);
    const before = device.profile.learner;
    await device.sync();
    expect(device.profile.learner).toEqual(before);
  });
});
