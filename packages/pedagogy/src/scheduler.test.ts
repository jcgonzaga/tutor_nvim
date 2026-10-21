import { describe, expect, it } from "vitest";
import {
  enqueueInSession,
  isDue,
  retrievability,
  scheduleReview,
  takeDueInSession,
  type ReviewAttempt,
} from "./scheduler";
import { createUserSkill } from "./userSkill";
import { CONFIG, DAY_MS, T0 } from "./test-util";
import type { ReviewState } from "./types";

const attempt = (overrides: Partial<ReviewAttempt> = {}): ReviewAttempt => ({
  at: T0,
  success: true,
  performance: 100,
  hintsUsed: 0,
  delayed: false,
  ...overrides,
});

const days = (review: ReviewState, from = T0): number => (review.dueAt - from) / DAY_MS;

/** Runs `performance` reviews, each made exactly when the previous one fell due. */
function ladder(performance: number, steps: number): ReviewState[] {
  const states: ReviewState[] = [];
  let state = scheduleReview(null, attempt({ performance }), CONFIG).review;
  states.push(state);
  for (let step = 0; step < steps; step += 1) {
    state = scheduleReview(
      state,
      attempt({ at: state.dueAt, performance, delayed: true }),
      CONFIG,
    ).review;
    states.push(state);
  }
  return states;
}

describe("review scheduler v1 (T-406)", () => {
  it("schedules a first success about a day out and asks to see it again within the session", () => {
    const result = scheduleReview(null, attempt(), CONFIG);
    expect(days(result.review)).toBeGreaterThan(1);
    expect(days(result.review)).toBeLessThan(1.6);
    expect(result.inSessionAfter).toBe(CONFIG.scheduler.inSession.afterShakyPass);
    expect(result.review.streak).toBe(0);
    expect(result.lapse).toBe(false);
  });

  it("walks up the 1, 3, 7, 14, 30 day ladder with on-time perfect reviews", () => {
    const intervals = ladder(100, 5).map((state, index, all) =>
      days(state, index === 0 ? T0 : (all[index - 1]?.dueAt ?? T0)),
    );
    // Each interval is the rung scaled by performance (1.4x), capped by growth from the last one.
    for (let index = 1; index < intervals.length; index += 1) {
      expect(intervals[index]).toBeGreaterThan(intervals[index - 1] ?? 0);
    }
    expect(Math.round(intervals[5] ?? 0)).toBeGreaterThanOrEqual(30);
  });

  it("brings a failed skill back within minutes and again within the session", () => {
    const result = scheduleReview(null, attempt({ success: false, performance: 0 }), CONFIG);
    expect(result.lapse).toBe(true);
    expect(result.review.dueAt - T0).toBe(CONFIG.scheduler.lapseRetryMs);
    expect(result.inSessionAfter).toBe(CONFIG.scheduler.inSession.afterLapse);
    expect(result.review.streak).toBe(0);
  });

  it("treats a pass under the pass mark as a lapse", () => {
    expect(scheduleReview(null, attempt({ performance: 40 }), CONFIG).lapse).toBe(true);
  });

  it("a lapse resets the streak and halves stability", () => {
    const [, , third] = ladder(100, 2);
    const lapsed = scheduleReview(
      third ?? null,
      attempt({ at: third?.dueAt ?? 0, success: false, performance: 0, delayed: true }),
      CONFIG,
    );
    expect(lapsed.review.streak).toBe(0);
    expect(lapsed.review.stability).toBeCloseTo((third?.stability ?? 0) / 2);
  });

  it("a weak skill returns sooner than a strong one", () => {
    const strong = ladder(100, 3).at(-1);
    const weak = ladder(65, 3).at(-1);
    expect(weak?.stability).toBeLessThan(strong?.stability ?? 0);
    const sameStart = scheduleReview(null, attempt({ performance: 65 }), CONFIG);
    const strongStart = scheduleReview(null, attempt({ performance: 100 }), CONFIG);
    expect(sameStart.review.dueAt).toBeLessThan(strongStart.review.dueAt);
    const failed = scheduleReview(null, attempt({ success: false, performance: 0 }), CONFIG);
    expect(failed.review.dueAt).toBeLessThan(sameStart.review.dueAt);
  });

  it("same-session repetition never advances the ladder or pushes the due date", () => {
    const first = scheduleReview(null, attempt(), CONFIG).review;
    let state = first;
    for (let index = 1; index <= 20; index += 1) {
      state = scheduleReview(state, attempt({ at: T0 + index * 60_000 }), CONFIG).review;
    }
    expect(state.streak).toBe(0);
    expect(state.dueAt).toBe(first.dueAt);
    expect(state.stability).toBe(first.stability);
  });

  it("practicing early after a delay does not advance the ladder either", () => {
    const first = scheduleReview(null, attempt(), CONFIG).review;
    const early = scheduleReview(
      first,
      attempt({ at: T0 + 14 * 3_600_000, delayed: true }),
      CONFIG,
    );
    expect(early.scheduledReview).toBe(false);
    expect(early.review.streak).toBe(0);
  });

  it("a scheduled review advances the streak", () => {
    const first = scheduleReview(null, attempt(), CONFIG).review;
    const review = scheduleReview(first, attempt({ at: first.dueAt, delayed: true }), CONFIG);
    expect(review.scheduledReview).toBe(true);
    expect(review.review.streak).toBe(1);
    expect(review.inSessionAfter).toBeNull();
  });

  it("using hints keeps the streak and shortens the interval", () => {
    const first = scheduleReview(null, attempt(), CONFIG).review;
    const clean = scheduleReview(first, attempt({ at: first.dueAt, delayed: true }), CONFIG);
    const helped = scheduleReview(
      first,
      attempt({ at: first.dueAt, delayed: true, hintsUsed: 1 }),
      CONFIG,
    );
    expect(helped.review.streak).toBe(0);
    expect(helped.review.dueAt).toBeLessThan(clean.review.dueAt);
    expect(helped.inSessionAfter).not.toBeNull();
  });

  it("limits growth after a lapse so recovery cannot jump straight to a long interval", () => {
    const lapsed = scheduleReview(
      ladder(100, 4).at(-1) ?? null,
      attempt({ at: T0, success: false, performance: 0, delayed: true }),
      CONFIG,
    ).review;
    const recovered = scheduleReview(lapsed, attempt({ at: T0 + 3_600_000 }), CONFIG).review;
    expect(days(recovered, T0 + 3_600_000)).toBeLessThanOrEqual(lapsed.stability * 3 + 1e-9);
  });

  it("is deterministic", () => {
    const run = () => ladder(88, 4);
    expect(run()).toEqual(run());
  });

  it("never lets difficulty leave 0-1", () => {
    const hard = scheduleReview(null, attempt({ success: false, performance: 0 }), CONFIG).review;
    expect(hard.difficulty).toBeGreaterThan(0.5);
    expect(hard.difficulty).toBeLessThanOrEqual(1);
  });
});

describe("due dates are whole milliseconds", () => {
  // A fractional epoch time breaks anything that stores it as an integer (the database column
  // rejected one in production-shaped data). Whatever the performance, difficulty and clock say.
  it("never produces a fractional due date", () => {
    for (const performance of [61, 64.7, 73.3, 88.88, 95.123, 100]) {
      for (const at of [T0, T0 + 12_345, T0 + 3_600_001]) {
        let state = scheduleReview(null, attempt({ at, performance }), CONFIG).review;
        for (let step = 0; step < 6; step += 1) {
          expect(Number.isInteger(state.dueAt), `${performance} @ ${at} step ${step}`).toBe(true);
          state = scheduleReview(
            state,
            attempt({
              at: state.dueAt + step * 777,
              performance: performance - step * 3.1,
              delayed: true,
            }),
            CONFIG,
          ).review;
        }
      }
    }
  });
});

describe("retrievability and due dates", () => {
  const skill = {
    ...createUserSkill("vim.test"),
    lastAttemptAt: T0,
    nextReviewAt: T0 + DAY_MS,
    review: scheduleReview(null, attempt(), CONFIG).review,
  };

  it("decays with time since the last attempt, slower for stable memories", () => {
    expect(retrievability(skill, T0)).toBe(1);
    expect(retrievability(skill, T0 + 5 * DAY_MS)).toBeLessThan(retrievability(skill, T0 + DAY_MS));
    const stabler = { ...skill, review: { ...skill.review, stability: 30 } };
    expect(retrievability(stabler, T0 + 5 * DAY_MS)).toBeGreaterThan(
      retrievability(skill, T0 + 5 * DAY_MS),
    );
    expect(retrievability(createUserSkill("vim.new"), T0)).toBe(0);
  });

  it("is due once nextReviewAt has arrived", () => {
    expect(isDue(skill, T0)).toBe(false);
    expect(isDue(skill, T0 + DAY_MS)).toBe(true);
    expect(isDue(createUserSkill("vim.new"), T0)).toBe(false);
  });
});

describe("in-session reappearance (4 and 12 exercises)", () => {
  it("returns a skill after the requested number of exercises", () => {
    const queue = enqueueInSession([], "vim.a", 4, 3);
    expect(takeDueInSession(queue, 6).due).toEqual([]);
    const { due, rest } = takeDueInSession(queue, 7);
    expect(due).toEqual([{ skillId: "vim.a", dueAtIndex: 7 }]);
    expect(rest).toEqual([]);
  });

  it("keeps the earlier reappearance when a skill is queued twice", () => {
    let queue = enqueueInSession([], "vim.a", 12, 0);
    queue = enqueueInSession(queue, "vim.a", 4, 1);
    expect(queue).toEqual([{ skillId: "vim.a", dueAtIndex: 5 }]);
    expect(enqueueInSession(queue, "vim.a", 12, 2)).toEqual(queue);
  });

  it("orders what is due by index then skill id", () => {
    let queue = enqueueInSession([], "vim.b", 4, 0);
    queue = enqueueInSession(queue, "vim.a", 4, 0);
    queue = enqueueInSession(queue, "vim.c", 2, 0);
    expect(takeDueInSession(queue, 4).due.map((entry) => entry.skillId)).toEqual([
      "vim.c",
      "vim.a",
      "vim.b",
    ]);
  });
});
