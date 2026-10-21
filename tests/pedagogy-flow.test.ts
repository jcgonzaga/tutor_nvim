import { describe, expect, it } from "vitest";
import { evaluateAttempt, simulateSolution } from "@tutor-nvim/evaluation";
import { loadContent, type Exercise } from "@tutor-nvim/exercise-schema";
import {
  DAY_MS,
  DEFAULT_PEDAGOGY_CONFIG,
  EMPTY_LEARNER,
  buildDailySession,
  getUserSkill,
  masteryBlockers,
  recordAttempt,
  resolveStages,
  sessionItems,
  type AttemptRecord,
  type LearnerState,
} from "@tutor-nvim/pedagogy";

import { readContentInput } from "../scripts/content-fs";

const bundle = loadContent(readContentInput());
const byId = new Map(bundle.exercises.map((exercise) => [exercise.id, exercise]));
const START = Date.UTC(2026, 0, 1, 8, 0, 0);

interface Journey {
  readonly learner: LearnerState;
  readonly history: readonly AttemptRecord[];
  readonly log: readonly {
    day: number;
    sessionSize: number;
    reviews: number;
    mastered: string[];
  }[];
}

/** Plays `exercise` the way a learner typing its optimal solution would, then updates the learner. */
function play(
  learner: LearnerState,
  exercise: Exercise,
  startedAt: number,
): { learner: LearnerState; record: AttemptRecord } {
  const solution = exercise.solutions.find((candidate) => candidate.classification === "optimal");
  if (!solution) throw new Error(`${exercise.id} has no optimal solution`);
  const attempt = simulateSolution(exercise, solution, { startedAt, stepMs: 100 });
  const evaluation = evaluateAttempt(exercise, attempt);
  const at = attempt.completedAt ?? startedAt;
  const { learner: next } = recordAttempt(bundle.skills, learner, {
    exercise,
    outcome: evaluation.metrics,
    at,
  });
  return {
    learner: next,
    record: {
      exerciseId: exercise.id,
      skillIds: exercise.skillIds,
      at,
      success: evaluation.success,
      performance: evaluation.metrics.performanceScore,
    },
  };
}

/** One session per day for `days` days, a perfect learner who follows the builder exactly. */
function liveJourney(days: number, everyDays = 1): Journey {
  let learner = EMPTY_LEARNER;
  const history: AttemptRecord[] = [];
  const log: Journey["log"][number][] = [];
  for (let day = 0; day < days; day += everyDays) {
    const now = START + day * DAY_MS;
    const session = buildDailySession({
      userId: "learner-1",
      date: new Date(now).toISOString().slice(0, 10),
      now,
      skills: bundle.skills,
      exercises: bundle.exercises,
      learner,
      history,
    });
    let clock = now;
    for (const item of sessionItems(session)) {
      const exercise = byId.get(item.exerciseId);
      if (!exercise) throw new Error(`session refers to unknown exercise ${item.exerciseId}`);
      const played = play(learner, exercise, clock);
      learner = played.learner;
      history.push(played.record);
      clock = played.record.at + 5_000;
    }
    log.push({
      day,
      sessionSize: sessionItems(session).length,
      reviews: session.reviews.length,
      mastered: Object.values(learner.skills)
        .filter((skill) => skill.stage === "mastered")
        .map((skill) => skill.skillId),
    });
  }
  return { learner, history, log };
}

describe("M4 integration: exercise → attempt → evaluation → mastery → review scheduling", () => {
  it("turns one real evaluated attempt into evidence and a review date", () => {
    const exercise = bundle.exercises.find(
      (candidate) => candidate.slug === "vim.ci-quotes.basic-001",
    );
    if (!exercise) throw new Error('missing ci" exercise');
    const { learner } = play(EMPTY_LEARNER, exercise, START);
    const skill = getUserSkill(learner, "vim.textobject.inner-quotes");

    expect(skill.attemptCount).toBe(1);
    expect(skill.accuracy).toBeGreaterThan(0);
    expect(skill.retention).toBe(0);
    expect(skill.nextReviewAt).toBeGreaterThan(START + DAY_MS / 2);
    expect(skill.review?.lastPerformance).toBe(100);
    // Attempted before its prerequisites: the evidence is kept but the skill stays locked.
    expect(skill.stage).toBe("locked");
  });

  it("keeps every skill reachable: each has an exercise using only itself and its ancestors", () => {
    const bySlug = new Map(bundle.skills.map((skill) => [skill.slug, skill]));
    const ancestors = (slug: string, seen = new Set<string>()): Set<string> => {
      for (const prerequisite of bySlug.get(slug)?.prerequisites ?? []) {
        if (!seen.has(prerequisite)) ancestors(prerequisite, seen.add(prerequisite));
      }
      return seen;
    };
    const unreachable = bundle.skills
      .filter((skill) => skill.enabled)
      .filter((skill) => {
        const allowed = new Set([skill.slug, ...ancestors(skill.slug)]);
        return !bundle.exercises.some(
          (exercise) =>
            exercise.skillIds.includes(skill.slug) &&
            exercise.skillIds.every((id) => allowed.has(id)),
        );
      })
      .map((skill) => skill.slug);
    // A root skill whose only exercise also trains a locked skill would dead-end a new learner.
    expect(unreachable).toEqual([]);
  });

  it("starts a new learner on the root skills only: one in Vim and one in the shell, side by side", () => {
    const stages = resolveStages(bundle.skills, EMPTY_LEARNER, DEFAULT_PEDAGOGY_CONFIG);
    const unlocked = Object.entries(stages).filter(([, stage]) => stage !== "locked");
    expect(unlocked.map(([slug]) => slug).sort()).toEqual([
      "linux.shell.navigation",
      "vim.mode.normal",
    ]);
  });

  it("follows a learner over six weeks: reviews return, prerequisites open the map, no day-one mastery", () => {
    const { learner, log } = liveJourney(42);
    expect(log[0]?.mastered).toEqual([]);
    expect(log[0]?.reviews).toBe(0);
    expect(log.some((entry) => entry.day > 0 && entry.reviews > 0)).toBe(true);

    const stages = resolveStages(bundle.skills, learner, DEFAULT_PEDAGOGY_CONFIG);
    const reached = Object.values(stages).filter((stage) => stage !== "locked").length;
    expect(reached).toBeGreaterThan(5);

    // Every mastered skill earned it through delayed recall and transfer.
    for (const skill of Object.values(learner.skills)) {
      if (skill.stage !== "mastered") continue;
      expect(skill.delayedRecallCount).toBeGreaterThanOrEqual(1);
      expect(skill.transferCount).toBeGreaterThanOrEqual(1);
      expect(masteryBlockers(skill, DEFAULT_PEDAGOGY_CONFIG)).toEqual([]);
    }
  });

  it("only skills with context variation can be mastered, and since M7 that is every skill", () => {
    const { learner } = liveJourney(60);
    const mastered = Object.values(learner.skills)
      .filter((skill) => skill.stage === "mastered")
      .map((skill) => skill.skillId);
    const withVariation = new Set(
      bundle.skills
        .filter((skill) => {
          const contexts = new Set(
            bundle.exercises
              .filter((exercise) => exercise.skillIds.includes(skill.slug))
              .map((exercise) => `${exercise.metadata.language}/${exercise.metadata.context}`),
          );
          return contexts.size > 1;
        })
        .map((skill) => skill.slug),
    );
    for (const slug of mastered) expect(withVariation.has(slug)).toBe(true);
    // The M4 content gap (skills with a single context could never be mastered) is closed.
    expect(
      bundle.skills.filter((skill) => !withVariation.has(skill.slug)).map((s) => s.slug),
    ).toEqual([]);
  });

  it("is reproducible: the same history yields the same learner and sessions", () => {
    expect(liveJourney(20)).toEqual(liveJourney(20));
  });

  it("never serves an exercise whose skills are still locked", () => {
    let learner = EMPTY_LEARNER;
    const stagesAtStart = resolveStages(bundle.skills, learner, DEFAULT_PEDAGOGY_CONFIG);
    const session = buildDailySession({
      userId: "learner-1",
      date: "2026-01-01",
      now: START,
      skills: bundle.skills,
      exercises: bundle.exercises,
      learner,
      history: [],
    });
    for (const item of sessionItems(session)) {
      expect(stagesAtStart[item.skillId]).not.toBe("locked");
    }
    learner = liveJourney(3).learner;
    expect(Object.keys(learner.skills).length).toBeGreaterThan(0);
  });
});
