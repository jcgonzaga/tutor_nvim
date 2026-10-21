import { describe, expect, it } from "vitest";
import {
  buildReplay,
  evaluateAttempt,
  masterRun,
  runOf,
  simulateSolution,
  describeFeedback,
} from "@tutor-nvim/evaluation";
import { isVimExercise, loadContent, type Exercise } from "@tutor-nvim/exercise-schema";
import {
  DAY_MS,
  DEFAULT_GAMIFICATION_CONFIG,
  applyAttempt,
  buildDailySession,
  completeOnboarding,
  completeSessionItem,
  createProfile,
  currentItem,
  currentStreak,
  endSession,
  finishAttempt,
  startSession,
  type Profile,
} from "@tutor-nvim/pedagogy";
import { readContentInput } from "../scripts/content-fs";

/**
 * M8 over the real curriculum: the game layer runs next to the learning layer without ever
 * changing it, and what it stores replays.
 */
const { skills, exercises } = loadContent(readContentInput());
const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const exerciseOf = (id: string): Exercise => {
  const found = byId.get(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
};
const START = Date.UTC(2026, 0, 5, 9, 0, 0);
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

function solveOptimally<E extends Exercise>(exercise: E) {
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  if (!optimal) throw new Error(`${exercise.slug} has no optimal solution`);
  return simulateSolution(exercise, optimal, { stepMs: 150 });
}

/** Plays one daily session twice over: with the game layer, and with the learning path alone. */
function playDay(game: Profile, plain: Profile, day: number) {
  const now = START + day * DAY_MS;
  const date = dayOf(now);
  const plan = (profile: Profile) =>
    buildDailySession({
      userId: profile.userId,
      date,
      now,
      skills,
      exercises,
      learner: profile.learner,
      history: profile.history,
    });
  // The same learner state must give the same plan, with or without XP.
  expect(plan(game)).toEqual(plan(plain));

  let g = startSession(game, plan(game), now);
  let p = plain;
  const options = {
    exerciseIdsForSkill: (skillId: string) =>
      exercises.filter((e) => e.skillIds.includes(skillId)).map((e) => e.id),
    skillsOf: (id: string) => exerciseOf(id).skillIds,
  };
  let at = now;
  let items = 0;
  for (let guard = 0; guard < 80; guard++) {
    const run = g.activeSession?.run;
    const item = run ? currentItem(run) : null;
    if (!item) break;
    const exercise = exerciseOf(item.exerciseId);
    const attempt = solveOptimally(exercise);
    const evaluation = evaluateAttempt(exercise, attempt);
    at += 30_000;
    const finished = { exercise, metrics: evaluation.metrics, at };
    const result = finishAttempt(g, skills, finished, {
      feedback: describeFeedback(exercise, attempt, evaluation).kind,
      strategy: evaluation.strategy,
      maxHintLevel: 0,
      antiPatterns: evaluation.antiPatterns.length,
      run: { ...runOf(attempt), performance: evaluation.metrics.performanceScore, at },
      day: date,
      dayOf,
      inSession: true,
    });
    g = completeSessionItem(
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
    p = applyAttempt(p, skills, finished).profile;
    p = p.activeSession ? p : startSession(p, plan(p), now);
    p = completeSessionItem(
      p,
      {
        success: evaluation.success,
        performance: evaluation.metrics.performanceScore,
        at,
        scheduledReview: false,
        improved: [],
        skillUpdates: result.updates,
      },
      options,
    );
    items += 1;
  }
  return { game: endSession(g, at, false), plain: endSession(p, at, false), items };
}

describe("the game layer over the real curriculum", () => {
  const days = 24;
  const onboarded = (id: string) =>
    completeOnboarding(createProfile(id, START), skills, null, START);
  let game = onboarded("walkthrough");
  let plain = onboarded("walkthrough");
  const xpPerDay: number[] = [];
  for (let day = 0; day < days; day++) {
    const before = game.gamification.xp;
    const played = playDay(game, plain, day);
    game = played.game;
    plain = played.plain;
    xpPerDay.push(game.gamification.xp - before);
  }
  const lastDay = dayOf(START + (days - 1) * DAY_MS);

  it("never changes what is learned: the learner is identical with and without XP", () => {
    expect(game.learner).toEqual(plain.learner);
    expect(game.history).toEqual(plain.history);
    expect(game.personalBests).toEqual(plain.personalBests);
  });

  it("builds a streak from consecutive daily sessions", () => {
    expect(currentStreak(game.gamification.streak, lastDay)).toBe(days);
    expect(game.gamification.streak.longest).toBe(days);
  });

  it("pays every day, keeps attempt XP under the daily cap, and pays the daily bonus once a day", () => {
    for (const [day, xp] of xpPerDay.entries()) expect(xp, `day ${day}`).toBeGreaterThan(0);
    for (const [key, earned] of Object.entries(game.gamification.xpByDay)) {
      expect(earned, key).toBeLessThanOrEqual(DEFAULT_GAMIFICATION_CONFIG.xp.dailyCap);
    }
    const bonusDays = game.sessions.filter((entry) => (entry.xp ?? 0) > 0).length;
    expect(bonusDays).toBe(days);
  });

  it("keeps XP growing without ever buying mastery", () => {
    expect(game.gamification.xp).toBeGreaterThan(
      days * DEFAULT_GAMIFICATION_CONFIG.xp.dailyCompletionBonus,
    );
    // The learner is the plain learner, byte for byte; XP is a separate number.
    expect(JSON.stringify(game.learner)).toBe(JSON.stringify(plain.learner));
  });

  it("stores a best run for every exercise played, and each one replays to a solved state", () => {
    const stored = Object.entries(game.gamification.bestRuns);
    expect(stored.length).toBeGreaterThan(20);
    for (const [exerciseId, run] of stored) {
      const exercise = exerciseOf(exerciseId);
      // Replay shows an editor, so it only exists for Vim exercises.
      if (!isVimExercise(exercise)) continue;
      const frames = buildReplay(exercise, run);
      const live = solveOptimally(exercise);
      if (live.kind !== "vim") continue;
      const last = frames[frames.length - 1];
      expect(last?.lines, exercise.slug).toEqual(live.state.buffer.lines);
      expect(last?.cursor, exercise.slug).toEqual(live.state.cursor);
      expect(last?.mode, exercise.slug).toBe(live.state.mode);
    }
  });

  it("is deterministic: the same history gives the same game state", () => {
    let again = onboarded("walkthrough");
    let againPlain = onboarded("walkthrough");
    for (let day = 0; day < days; day++) {
      const played = playDay(again, againPlain, day);
      again = played.game;
      againPlain = played.plain;
    }
    expect(again.gamification).toEqual(game.gamification);
  });
});

describe("every exercise can be shown to the learner as a ghost", () => {
  it("replays the master's run of all exercises to the state the engine reaches", () => {
    for (const exercise of exercises) {
      const master = masterRun(exercise);
      expect(master, exercise.slug).not.toBeNull();
      if (!master || !isVimExercise(exercise)) continue;
      const frames = buildReplay(exercise, master);
      const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
      const live = simulateSolution(exercise, optimal ?? exercise.solutions[0]!);
      const last = frames[frames.length - 1];
      expect(last?.lines, exercise.slug).toEqual(live.state.buffer.lines);
    }
  });
});
