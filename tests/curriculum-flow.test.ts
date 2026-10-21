import { describe, expect, it } from "vitest";
import { evaluateAttempt, simulateSolution } from "@tutor-nvim/evaluation";
import { loadContent, type Exercise } from "@tutor-nvim/exercise-schema";
import {
  DAY_MS,
  applyAttempt,
  buildDailySession,
  completeOnboarding,
  completeSessionItem,
  createProfile,
  currentItem,
  endSession,
  startSession,
  type Profile,
} from "@tutor-nvim/pedagogy";
import { readContentInput } from "../scripts/content-fs";

/**
 * A learner who always solves every exercise the best way, one session a day, over the real
 * curriculum. It is not a model of a real person: it answers "does the content and the unlock graph
 * let someone get all the way through, with a useful session every day?"
 */
const { skills, exercises } = loadContent(readContentInput());
const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const exerciseOf = (id: string): Exercise => {
  const found = byId.get(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
};
const START = Date.UTC(2026, 0, 5, 9, 0, 0);

function metricsFor(exercise: Exercise) {
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  if (!optimal) throw new Error(`${exercise.slug} has no optimal solution`);
  return evaluateAttempt(exercise, simulateSolution(exercise, optimal, { stepMs: 150 })).metrics;
}

function playDay(profile: Profile, day: number): { profile: Profile; items: number } {
  const now = START + day * DAY_MS;
  const date = new Date(now).toISOString().slice(0, 10);
  const plan = buildDailySession({
    userId: profile.userId,
    date,
    now,
    skills,
    exercises,
    learner: profile.learner,
    history: profile.history,
  });
  let current = startSession(profile, plan, now);
  const options = {
    exerciseIdsForSkill: (skillId: string) =>
      exercises.filter((e) => e.skillIds.includes(skillId)).map((e) => e.id),
    skillsOf: (id: string) => exerciseOf(id).skillIds,
  };
  let at = now;
  let items = 0;
  for (let guard = 0; guard < 80; guard++) {
    const run = current.activeSession?.run;
    const item = run ? currentItem(run) : null;
    if (!item) break;
    const exercise = exerciseOf(item.exerciseId);
    const metrics = metricsFor(exercise);
    at += 30_000;
    const applied = applyAttempt(current, skills, { exercise, metrics, at });
    current = completeSessionItem(
      applied.profile,
      {
        success: metrics.success,
        performance: metrics.performanceScore,
        at,
        scheduledReview: applied.updates.some((update) => update.scheduledReview),
        improved: applied.improved,
        skillUpdates: applied.updates,
      },
      options,
    );
    items += 1;
  }
  return { profile: endSession(current, at, false), items };
}

describe("a diligent learner over the real curriculum", () => {
  const days = 45;
  const history: {
    day: number;
    items: number;
    unlocked: number;
    fluent: number;
    mastered: number;
  }[] = [];
  let profile = completeOnboarding(createProfile("walkthrough", START), skills, null, START);
  for (let day = 0; day < days; day++) {
    const played = playDay(profile, day);
    profile = played.profile;
    const stages = Object.values(profile.learner.skills).map((skill) => skill.stage);
    history.push({
      day,
      items: played.items,
      unlocked: stages.filter((stage) => stage !== "locked").length,
      fluent: stages.filter((stage) => stage === "fluent" || stage === "mastered").length,
      mastered: stages.filter((stage) => stage === "mastered").length,
    });
  }

  it("gets a session with something to do on every day", () => {
    for (const entry of history) expect(entry.items, `day ${entry.day}`).toBeGreaterThan(0);
  });

  it("unlocks the whole skill graph: no skill is a dead end", () => {
    const stages = new Map(Object.values(profile.learner.skills).map((s) => [s.skillId, s.stage]));
    const stuck = skills
      .filter((skill) => skill.enabled && (stages.get(skill.slug) ?? "locked") === "locked")
      .map((skill) => skill.slug);
    expect(stuck).toEqual([]);
  });

  it("gets every skill to fluent within the period", () => {
    const behind = skills
      .filter((skill) => skill.enabled)
      .filter((skill) => {
        const stage = profile.learner.skills[skill.slug]?.stage;
        return stage !== "fluent" && stage !== "mastered";
      })
      .map((skill) => skill.slug);
    expect(behind).toEqual([]);
  });

  it("lets skills reach mastered, which needs delayed recall and a second context", () => {
    expect(history[history.length - 1]?.mastered ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("does not let a same-day session finish with fewer than five exercises once the basics are known", () => {
    const later = history.filter((entry) => entry.day >= 5);
    for (const entry of later) expect(entry.items, `day ${entry.day}`).toBeGreaterThanOrEqual(5);
  });

  it("keeps sessions a sensible length", () => {
    for (const entry of history) expect(entry.items, `day ${entry.day}`).toBeLessThanOrEqual(20);
  });
});
