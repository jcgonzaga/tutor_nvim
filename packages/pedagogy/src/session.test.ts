import { describe, expect, it } from "vitest";
import {
  SESSION_BLOCKS,
  buildDailySession,
  sessionItems,
  type DailySession,
  type SessionRequest,
} from "./session";
import { refreshStages } from "./progress";
import { resolveStages } from "./unlock";
import { EMPTY_LEARNER, type LearnerState } from "./types";
import { CONFIG, DAY_MS, FAILED, PERFECT, T0, exerciseFor, replay, skillOf } from "./test-util";

// a ─┬─ b ── d
//    └─ c ── e
const skills = [
  skillOf("vim.a"),
  skillOf("vim.b", ["vim.a"], 2),
  skillOf("vim.c", ["vim.a"], 2),
  skillOf("vim.d", ["vim.b"], 3),
  skillOf("vim.e", ["vim.c"], 3),
];

const exercises = [
  ...["a", "b", "c", "d", "e"].flatMap((letter, index) => [
    exerciseFor(`ex-${letter}-1`, [`vim.${letter}`], {
      language: "javascript",
      difficulty: 1 + (index % 2),
    }),
    exerciseFor(`ex-${letter}-2`, [`vim.${letter}`], { language: "javascript", difficulty: 3 }),
    exerciseFor(`ex-${letter}-3`, [`vim.${letter}`], { language: "javascript", difficulty: 2 }),
    exerciseFor(`ex-${letter}-4`, [`vim.${letter}`], { language: "javascript", difficulty: 4 }),
    exerciseFor(`ex-${letter}-py`, [`vim.${letter}`], {
      language: "python",
      context: "config-file",
      difficulty: 3,
      transfer: true,
    }),
  ]),
];
const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const ex = (id: string) => {
  const found = byId.get(id);
  if (!found) throw new Error(id);
  return found;
};

/**
 * a was reviewed on schedule (so it is fluent and not due for a long while); b and c were
 * practiced once and are due; d and e just unlocked.
 */
function spaced(): LearnerState {
  return replay(skills, [
    ...Array.from({ length: 6 }, (_, i) => [ex("ex-a-1"), PERFECT, T0 + i * 60_000] as const),
    [ex("ex-a-2"), PERFECT, T0 + 2 * DAY_MS],
    [ex("ex-a-1"), PERFECT, T0 + 5 * DAY_MS],
    ...Array.from(
      { length: 3 },
      (_, i) => [ex("ex-b-1"), PERFECT, T0 + 6 * 60_000 + i * 60_000] as const,
    ),
    [ex("ex-c-1"), FAILED, T0 + 20 * 60_000],
    [ex("ex-c-1"), PERFECT, T0 + 22 * 60_000],
    [ex("ex-c-1"), PERFECT, T0 + 23 * 60_000],
  ]);
}

const NOW = T0 + 6 * DAY_MS;
function request(learner: LearnerState, overrides: Partial<SessionRequest> = {}): SessionRequest {
  return {
    userId: "user-1",
    date: "2026-01-04",
    now: NOW,
    skills,
    exercises,
    learner,
    history: [],
    ...overrides,
  };
}

const ids = (session: DailySession) => sessionItems(session).map((item) => item.exerciseId);

describe("daily session builder (T-408)", () => {
  it("gives a new learner a short learn-only session on the root skill", () => {
    const session = buildDailySession(request(EMPTY_LEARNER), CONFIG);
    expect(session.warmup).toEqual([]);
    expect(session.reviews).toEqual([]);
    expect(session.mixed).toEqual([]);
    expect(session.challenge).toEqual([]);
    expect(session.learn).toHaveLength(CONFIG.session.counts.learn);
    expect(new Set(session.learn.map((item) => item.skillId))).toEqual(new Set(["vim.a"]));
    // Easiest exercise first.
    const difficulties = session.learn.map((item) => ex(item.exerciseId).difficulty);
    expect(difficulties).toEqual([...difficulties].sort((x, y) => x - y));
  });

  it("is deterministic for the same user, date and seed", () => {
    const learner = spaced();
    const first = buildDailySession(request(learner), CONFIG);
    const second = buildDailySession(request(learner), CONFIG);
    expect(second).toEqual(first);
  });

  it("varies with the seed but each seed is reproducible", () => {
    const learner = spaced();
    const variants = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) =>
        JSON.stringify(buildDailySession(request(learner, { seed }), CONFIG)),
      ),
    );
    expect(variants.size).toBeGreaterThan(1);
    expect(JSON.stringify(buildDailySession(request(learner, { seed: "a" }), CONFIG))).toBe(
      JSON.stringify(buildDailySession(request(learner, { seed: "a" }), CONFIG)),
    );
  });

  it("mixes every block for a learner with history", () => {
    const session = buildDailySession(request(spaced()), CONFIG);
    for (const block of SESSION_BLOCKS) {
      expect(session[block].length, block).toBeGreaterThan(0);
      for (const item of session[block]) expect(item.block).toBe(block);
    }
    expect(session.userId).toBe("user-1");
    expect(session.date).toBe("2026-01-04");
  });

  it("never repeats an exercise or offers a locked skill", () => {
    const learner = spaced();
    const session = buildDailySession(request(learner), CONFIG);
    const picked = ids(session);
    expect(new Set(picked).size).toBe(picked.length);
    const stages = resolveStages(skills, learner, CONFIG);
    for (const item of sessionItems(session)) {
      expect(stages[item.skillId]).not.toBe("locked");
      expect(ex(item.exerciseId).skillIds).toContain(item.skillId);
    }
  });

  it("fills reviews with due skills only, weakest first", () => {
    const learner = spaced();
    const session = buildDailySession(request(learner), CONFIG);
    const dueSkills = new Set(
      Object.values(learner.skills)
        .filter((skill) => skill.nextReviewAt !== null && skill.nextReviewAt <= NOW)
        .map((skill) => skill.skillId),
    );
    expect(session.reviews.length).toBeGreaterThan(0);
    for (const item of session.reviews) expect(dueSkills.has(item.skillId)).toBe(true);
    // c is the weakest due skill (it was failed first), so it leads.
    expect(session.reviews[0]?.skillId).toBe("vim.c");
  });

  it("keeps warm-up to skills the learner already owns, and out of the due list", () => {
    const learner = spaced();
    const session = buildDailySession(request(learner), CONFIG);
    const stages = resolveStages(skills, learner, CONFIG);
    expect(session.warmup.length).toBeGreaterThan(0);
    for (const item of session.warmup) {
      expect(["fluent", "mastered"]).toContain(stages[item.skillId]);
      expect(session.reviews.map((review) => review.skillId)).not.toContain(item.skillId);
    }
  });

  it("learns skills that just unlocked, never one that is still locked", () => {
    const session = buildDailySession(request(spaced()), CONFIG);
    expect(session.learn.length).toBeGreaterThan(0);
    for (const item of session.learn) expect(["vim.d", "vim.e"]).toContain(item.skillId);
  });

  it("builds the challenge from transfer exercises when they exist", () => {
    const session = buildDailySession(request(spaced()), CONFIG);
    expect(session.challenge.length).toBeGreaterThan(0);
    for (const item of session.challenge) {
      expect(ex(item.exerciseId).metadata.language).toBe("python");
      expect(item.reason).toMatch(/new context/);
    }
  });

  it("falls back to harder exercises when there is nothing to transfer to", () => {
    const noTransfer = exercises.filter((exercise) => !exercise.id.endsWith("-py"));
    const session = buildDailySession(request(spaced(), { exercises: noTransfer }), CONFIG);
    expect(session.challenge.length).toBeGreaterThan(0);
    for (const item of session.challenge) expect(item.reason).toMatch(/harder/);
  });

  it("lets quotas it cannot fill (nothing due, nothing fluent) flow into mixed practice", () => {
    // Practiced just now: nothing is due and nothing is fluent yet.
    const fresh = replay(skills, [
      [ex("ex-a-1"), PERFECT, NOW - 1000],
      [ex("ex-a-2"), PERFECT, NOW - 500],
    ]);
    const session = buildDailySession(request(fresh), CONFIG);
    expect(session.reviews).toEqual([]);
    expect(session.warmup).toEqual([]);
    expect(session.mixed.length).toBeLessThanOrEqual(
      CONFIG.session.counts.mixed + CONFIG.session.counts.warmup + CONFIG.session.counts.reviews,
    );
  });

  it("avoids long runs of the same skill outside the learn block", () => {
    const learner = spaced();
    for (const seed of ["", "x", "y", "z"]) {
      const session = buildDailySession(request(learner, { seed }), CONFIG);
      const played = SESSION_BLOCKS.filter((block) => block !== "learn")
        .flatMap((block) => session[block])
        .map((item) => item.skillId);
      let run = 1;
      for (let index = 1; index < played.length; index += 1) {
        run = played[index] === played[index - 1] ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(CONFIG.session.maxSameSkillRun);
      }
    }
  });

  it("honors configured block sizes", () => {
    const small = {
      ...CONFIG,
      session: {
        ...CONFIG.session,
        counts: { warmup: 0, reviews: 1, learn: 1, mixed: 1, challenge: 0 },
      },
    };
    const session = buildDailySession(request(spaced()), small);
    expect(session.warmup).toHaveLength(0);
    expect(session.reviews).toHaveLength(1);
    expect(session.learn).toHaveLength(1);
    expect(session.challenge).toHaveLength(0);
  });

  it("does not repeat what the learner just did when fresh exercises exist", () => {
    const learner = spaced();
    const history = ["a", "b", "c"].map((letter) => ({
      exerciseId: `ex-${letter}-1`,
      skillIds: [`vim.${letter}`],
      at: NOW - 3_600_000,
      success: true,
      performance: 100,
    }));
    const fresh = ["a", "b", "c"].map((letter) =>
      exerciseFor(`ex-${letter}-5`, [`vim.${letter}`], { language: "javascript" }),
    );
    const session = buildDailySession(
      request(learner, { history, exercises: [...exercises, ...fresh] }),
      CONFIG,
    );
    expect(ids(session).filter((id) => /^ex-[abc]-1$/.test(id))).toEqual([]);
  });

  it("puts exercises seen recently last when teaching a skill", () => {
    const history = [
      {
        exerciseId: "ex-a-1",
        skillIds: ["vim.a"],
        at: NOW - 60_000,
        success: true,
        performance: 100,
      },
    ];
    const session = buildDailySession(request(EMPTY_LEARNER, { history }), CONFIG);
    expect(session.learn.map((item) => item.exerciseId)).not.toContain("ex-a-1");
    expect(session.learn).toHaveLength(CONFIG.session.counts.learn);
  });
});

describe("placement (calibration)", () => {
  it("gives a learner placed past the basics a useful first session: new skills first, quick checks after", () => {
    const placed = refreshStages(skills, { skills: {}, placed: ["vim.a"] }, CONFIG);
    const session = buildDailySession(request(placed, { now: T0 }));
    const learn = session.learn.map((entry) => entry.skillId);

    // vim.b and vim.c unlock through the placement, so they come before the placed vim.a itself.
    expect(learn[0]).not.toBe("vim.a");
    const firstPlaced = learn.indexOf("vim.a");
    if (firstPlaced !== -1) {
      expect(learn.slice(firstPlaced).every((skillId) => skillId === "vim.a")).toBe(true);
    }
  });

  it("without placement a new learner can only start at the roots", () => {
    const session = buildDailySession(request(EMPTY_LEARNER, { now: T0 }));
    const learn = session.learn.map((entry) => entry.skillId);
    expect(learn.length).toBeGreaterThan(0);
    expect(learn.every((skillId) => skillId === "vim.a")).toBe(true);
  });
});
