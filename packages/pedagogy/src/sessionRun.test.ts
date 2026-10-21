import { describe, expect, it } from "vitest";
import { DEFAULT_PEDAGOGY_CONFIG } from "./config";
import type { DailySession, SessionBlock, SessionItem } from "./session";
import {
  completeItem,
  currentItem,
  isRunFinished,
  runProgress,
  startSessionRun,
  summarizeRun,
  type CompleteOptions,
  type ItemResult,
  type SessionRun,
} from "./sessionRun";
import { DAY_MS, PERFECT, T0, exerciseFor, replay, skillOf } from "./test-util";

const item = (exerciseId: string, skillId: string, block: SessionBlock = "mixed"): SessionItem => ({
  exerciseId,
  skillId,
  block,
  reason: "test",
});

function planOf(items: readonly SessionItem[]): DailySession {
  const blocks = { warmup: [], reviews: [], learn: [], mixed: [], challenge: [] } as Record<
    SessionBlock,
    SessionItem[]
  >;
  for (const entry of items) blocks[entry.block].push(entry);
  return { userId: "u", date: "2026-01-01", seed: "", ...blocks };
}

/** Six exercises on six skills; each skill has a second exercise to come back with. */
const six = ["a", "b", "c", "d", "e", "f"];
const plan = planOf(six.map((letter) => item(`ex-${letter}-1`, `vim.${letter}`)));

const options: CompleteOptions = {
  exerciseIdsForSkill: (skillId) => [`ex-${skillId.slice(4)}-1`, `ex-${skillId.slice(4)}-2`],
  skillsOf: (exerciseId) => [`vim.${exerciseId.split("-")[1]}`],
};

const ok = (overrides: Partial<ItemResult> = {}): ItemResult => ({
  success: true,
  performance: 90,
  at: T0,
  scheduledReview: false,
  improved: [],
  skillUpdates: [],
  ...overrides,
});
const lapse = (skillId: string): ItemResult =>
  ok({ success: false, performance: 0, skillUpdates: [{ skillId, inSessionAfter: 4 }] });

function play(run: SessionRun, results: ItemResult[]): SessionRun {
  return results.reduce((current, result) => completeItem(current, result, options), run);
}

describe("session run", () => {
  it("plays the plan in order and tracks progress", () => {
    let run = startSessionRun(plan);
    expect(currentItem(run)?.exerciseId).toBe("ex-a-1");
    expect(runProgress(run)).toEqual({ done: 0, total: 6 });

    run = play(run, [ok(), ok()]);
    expect(currentItem(run)?.exerciseId).toBe("ex-c-1");
    expect(runProgress(run)).toEqual({ done: 2, total: 6 });
    expect(run.completed.map((entry) => entry.exerciseId)).toEqual(["ex-a-1", "ex-b-1"]);
  });

  it("finishes after the last item", () => {
    const run = play(startSessionRun(plan), Array(6).fill(ok()));
    expect(isRunFinished(run)).toBe(true);
    expect(currentItem(run)).toBeNull();
    expect(completeItem(run, ok(), options)).toBe(run);
  });

  it("brings a lapsed skill back after four more exercises, with an exercise not played yet", () => {
    const early = play(startSessionRun(plan), [lapse("vim.a"), ok(), ok(), ok()]);
    expect(currentItem(early)?.exerciseId).toBe("ex-e-1"); // four exercises have gone by, not five yet

    const run = play(early, [ok()]);
    const next = currentItem(run);
    expect(next).toMatchObject({
      exerciseId: "ex-a-2",
      skillId: "vim.a",
      repeat: true,
      block: "reviews",
    });
    expect(runProgress(run)).toEqual({ done: 5, total: 7 }); // the queue grew by one
  });

  it("goes back to the same exercise when it is the only one", () => {
    const single: CompleteOptions = { ...options, exerciseIdsForSkill: () => ["ex-a-1"] };
    let run = startSessionRun(plan);
    run = [lapse("vim.a"), ok(), ok(), ok(), ok()].reduce(
      (current, result) => completeItem(current, result, single),
      run,
    );
    expect(currentItem(run)).toMatchObject({ exerciseId: "ex-a-1", repeat: true });
  });

  it("does not bring anything back when the scheduler did not ask", () => {
    const run = play(startSessionRun(plan), Array(5).fill(ok()));
    expect(currentItem(run)?.repeat).toBe(false);
    expect(runProgress(run).total).toBe(6);
  });

  it("caps how often one skill returns inside a session", () => {
    const cap = DEFAULT_PEDAGOGY_CONFIG.session.maxInSessionRepeats;
    const many = planOf(
      Array.from({ length: 30 }, (_, i) =>
        item(
          `ex-${["a", "b", "c", "d", "e", "f"][i % 6]}-1`,
          `vim.${["a", "b", "c", "d", "e", "f"][i % 6]}`,
        ),
      ),
    );
    let run = startSessionRun(many);
    let repeats = 0;
    for (let step = 0; step < 30 && !isRunFinished(run); step++) {
      const current = currentItem(run);
      if (current?.repeat) repeats += 1;
      // Every attempt at vim.a fails and asks to be seen again.
      run = completeItem(run, current?.skillId === "vim.a" ? lapse("vim.a") : ok(), options);
    }
    expect(run.repeats["vim.a"]).toBe(cap);
    expect(repeats).toBe(cap);
  });

  it("drops reappearances that would fall after the end of the session", () => {
    const short = planOf([item("ex-a-1", "vim.a"), item("ex-b-1", "vim.b")]);
    const run = play(startSessionRun(short), [lapse("vim.a"), ok()]);
    expect(isRunFinished(run)).toBe(true);
    expect(run.inSession).toHaveLength(1); // queued, but the session ended before its turn
  });

  it("records what each attempt was, including repeats and records", () => {
    const run = play(startSessionRun(plan), [
      ok({ scheduledReview: true, improved: ["time"], performance: 80, at: T0 + 5 }),
    ]);
    expect(run.completed[0]).toEqual({
      exerciseId: "ex-a-1",
      skillId: "vim.a",
      skillIds: ["vim.a"],
      block: "mixed",
      repeat: false,
      success: true,
      performance: 80,
      scheduledReview: true,
      improved: ["time"],
      at: T0 + 5,
    });
  });
});

describe("session summary", () => {
  const skills = [skillOf("vim.a"), skillOf("vim.b", ["vim.a"], 2)];

  it("reports skills trained, reviews, records, average and what is next", () => {
    const two = planOf([item("ex-a-1", "vim.a"), item("ex-a-2", "vim.a"), item("ex-b-1", "vim.b")]);
    const run = play(startSessionRun(two), [
      ok({ performance: 100, scheduledReview: true, improved: ["time", "efficiency"] }),
      ok({ performance: 50 }),
      ok({ performance: 90 }),
    ]);
    const learner = replay(skills, [[exerciseFor("ex-a-1", ["vim.a"]), PERFECT, T0]]);

    const summary = summarizeRun(run, skills, learner, T0 + 60_000);
    expect(summary).toMatchObject({
      exercises: 3,
      successes: 3,
      skillsTrained: ["vim.a", "vim.b"],
      reviewsCompleted: 1,
      personalBests: [{ exerciseId: "ex-a-1", metrics: ["time", "efficiency"] }],
    });
    expect(summary.averagePerformance).toBeCloseTo(80, 10);
    expect(summary.next.kind).toBe("next-review");
  });

  it("counts failures and handles an empty run", () => {
    const run = play(startSessionRun(plan), [lapse("vim.a")]);
    expect(summarizeRun(run, skills, replay(skills, []), T0 + DAY_MS)).toMatchObject({
      exercises: 1,
      successes: 0,
      averagePerformance: 0,
    });
    expect(summarizeRun(startSessionRun(plan), skills, replay(skills, []), T0)).toMatchObject({
      exercises: 0,
      skillsTrained: [],
      averagePerformance: 0,
    });
  });
});
