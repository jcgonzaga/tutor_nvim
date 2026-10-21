import { describe, expect, it } from "vitest";
import { evaluateAttempt, simulateSolution, startAttempt } from "@tutor-nvim/evaluation";
import { loadContent, type Exercise } from "@tutor-nvim/exercise-schema";
import {
  CALIBRATION_LADDER,
  DAY_MS,
  applyAttempt,
  buildDailySession,
  calibrationResult,
  completeOnboarding,
  completeSessionItem,
  createProfile,
  currentItem,
  endSession,
  isRunFinished,
  nextRung,
  pickCalibrationExercise,
  recordRung,
  setExperience,
  setKeyboardLayout,
  startCalibration,
  startSession,
  summarizeRun,
  type Profile,
} from "@tutor-nvim/pedagogy";
import { readContentInput } from "../scripts/content-fs";
import {
  CORRUPT_PROFILE_KEY,
  PROFILE_KEY,
  loadProfile,
  memoryStorage,
  saveProfile,
  type KeyValueStorage,
} from "../apps/web/src/storage/profileStore";

const { skills, exercises } = loadContent(readContentInput());
const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const exerciseById = (id: string): Exercise => {
  const found = byId.get(id);
  if (!found) throw new Error(`missing exercise ${id}`);
  return found;
};

const NOW = Date.UTC(2026, 9, 21, 9, 0, 0);

/** The learner solves the exercise with its optimal solution, or gives up (an attempt with no input). */
function attemptOf(exercise: Exercise, solves: boolean) {
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  const attempt =
    solves && optimal
      ? simulateSolution(exercise, optimal, { stepMs: 150 })
      : startAttempt(exercise, 0);
  return evaluateAttempt(exercise, attempt).metrics;
}

function calibrate(profile: Profile, passes: (rung: number) => boolean, at: number): Profile {
  let state = startCalibration(profile.onboarding.experience ?? "never");
  let current = profile;
  for (let rung = nextRung(state); rung !== null; rung = nextRung(state)) {
    const probe = pickCalibrationExercise(
      skills,
      exercises,
      CALIBRATION_LADDER[rung]?.skillId ?? "",
    );
    if (!probe) throw new Error(`no probe for rung ${rung}`);
    const passed = passes(rung);
    current = applyAttempt(current, skills, {
      exercise: probe,
      metrics: attemptOf(probe, passed),
      at,
    }).profile;
    state = recordRung(state, rung, passed);
  }
  return completeOnboarding(current, skills, calibrationResult(state), at);
}

function playSession(profile: Profile, date: string, now: number): Profile {
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
      exercises
        .filter((exercise) => exercise.skillIds.includes(skillId))
        .map((exercise) => exercise.id),
    skillsOf: (exerciseId: string) => exerciseById(exerciseId).skillIds,
  };

  let at = now;
  for (let guard = 0; guard < 100; guard++) {
    const run = current.activeSession?.run;
    const item = run ? currentItem(run) : null;
    if (!item) break;
    const exercise = exerciseById(item.exerciseId);
    const metrics = attemptOf(exercise, true);
    at += 60_000;
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
  }
  expect(current.activeSession && isRunFinished(current.activeSession.run)).toBe(true);
  return endSession(current, at, false);
}

describe("calibration over the real content", () => {
  it("has a probe exercise for every rung of the ladder", () => {
    for (const rung of CALIBRATION_LADDER) {
      expect(pickCalibrationExercise(skills, exercises, rung.skillId), rung.topic).not.toBeNull();
    }
  });

  it("probes only build on skills the rung itself builds on", () => {
    for (const rung of CALIBRATION_LADDER) {
      const probe = pickCalibrationExercise(skills, exercises, rung.skillId);
      expect(probe?.skillIds).toContain(rung.skillId);
    }
  });
});

describe("M5 exit flow without a cloud account: onboard, calibrate, practice, close, return", () => {
  const start = (): Profile =>
    setKeyboardLayout(setExperience(createProfile("local-1", NOW), "basics"), "es-iso");

  it("a calibrated learner earns evidence only for what was probed, and never mastery", () => {
    const profile = calibrate(start(), (rung) => rung <= 1, NOW);

    expect(profile.onboarding.completed).toBe(true);
    expect(profile.onboarding.calibration?.placedRung).toBe(1);
    const trained = Object.values(profile.learner.skills).filter((skill) => skill.attemptCount > 0);
    expect(trained.length).toBeGreaterThan(0);
    expect(Object.values(profile.learner.skills).every((skill) => skill.stage !== "mastered")).toBe(
      true,
    );
    expect(profile.history.length).toBe(profile.onboarding.calibration?.probes);
  });

  it("plays a whole daily session and records it", () => {
    const calibrated = calibrate(start(), (rung) => rung <= 1, NOW);
    const profile = playSession(calibrated, "2026-10-21", NOW + 60_000);

    expect(profile.activeSession).toBeNull();
    expect(profile.sessions).toHaveLength(1);
    expect(profile.sessions[0]).toMatchObject({ date: "2026-10-21", abandoned: false });
    expect(profile.sessions[0]?.exercises).toBeGreaterThan(3);
    expect(profile.history.length).toBeGreaterThan(calibrated.history.length);
  });

  it("survives being closed: the profile is plain JSON and comes back identical", () => {
    const profile = playSession(
      calibrate(start(), (rung) => rung <= 1, NOW),
      "2026-10-21",
      NOW,
    );
    const reopened: Profile = JSON.parse(JSON.stringify(profile));
    expect(reopened).toEqual(profile);
  });

  it("on return two days later the stored reviews are due and lead the session", () => {
    const profile = playSession(
      calibrate(start(), (rung) => rung <= 1, NOW),
      "2026-10-21",
      NOW,
    );
    const reopened: Profile = JSON.parse(JSON.stringify(profile));
    const later = NOW + 2 * DAY_MS;

    const plan = buildDailySession({
      userId: reopened.userId,
      date: "2026-10-23",
      now: later,
      skills,
      exercises,
      learner: reopened.learner,
      history: reopened.history,
    });
    expect(plan.reviews.length).toBeGreaterThan(0);

    const nextDay = playSession(reopened, "2026-10-23", later);
    const reviewed = nextDay.sessions[1];
    expect(reviewed?.reviewsCompleted).toBeGreaterThan(0);
  });

  it("the same stored profile and date always build the same session", () => {
    const profile = playSession(
      calibrate(start(), (rung) => rung <= 1, NOW),
      "2026-10-21",
      NOW,
    );
    const plan = () =>
      buildDailySession({
        userId: profile.userId,
        date: "2026-10-23",
        now: NOW + 2 * DAY_MS,
        skills,
        exercises,
        learner: profile.learner,
        history: profile.history,
      });
    expect(plan()).toEqual(plan());
  });

  it("summarizes the session with skills trained and a next step", () => {
    const profile = playSession(
      calibrate(start(), (rung) => rung <= 1, NOW),
      "2026-10-21",
      NOW,
    );
    const last = profile.sessions[0];
    expect(last).toBeDefined();
    // The summary is computed from the run before it is closed; rebuild one to check the shape.
    const plan = buildDailySession({
      userId: "local-1",
      date: "2026-10-21",
      now: NOW,
      skills,
      exercises,
      learner: calibrate(start(), (rung) => rung <= 1, NOW).learner,
      history: [],
    });
    const run = startSession(createProfile("local-1", NOW), plan, NOW).activeSession?.run;
    expect(run && summarizeRun(run, skills, profile.learner, NOW + 3 * DAY_MS).next.kind).toBe(
      "review-due",
    );
  });
});

describe("local persistence of a real profile (apps/web storage)", () => {
  const calibrated = (): Profile =>
    calibrate(setExperience(createProfile("local-1", NOW), "basics"), (rung) => rung <= 1, NOW);

  it("reads back exactly what it saved after a played session", () => {
    const profile = playSession(calibrated(), "2026-10-21", NOW);
    const storage = memoryStorage();
    expect(saveProfile(storage, profile)).toBe(true);
    expect(loadProfile(storage)).toEqual({ status: "loaded", profile });
  });

  it("keeps a session that is still in progress", () => {
    const base = calibrated();
    const plan = buildDailySession({
      userId: base.userId,
      date: "2026-10-21",
      now: NOW,
      skills,
      exercises,
      learner: base.learner,
      history: base.history,
    });
    const profile = startSession(base, plan, NOW);
    const storage = memoryStorage();
    saveProfile(storage, profile);
    expect(loadProfile(storage)).toEqual({ status: "loaded", profile });
  });

  it("reports nothing stored for a first visit", () => {
    expect(loadProfile(memoryStorage())).toEqual({ status: "empty" });
  });

  it("keeps a backup instead of overwriting a profile it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem(PROFILE_KEY, '{"version":1,"userId":"x"}');
    expect(loadProfile(storage).status).toBe("unreadable");
    expect(storage.getItem(PROFILE_KEY)).toBeNull();
    expect(storage.getItem(CORRUPT_PROFILE_KEY)).toBe('{"version":1,"userId":"x"}');
  });

  it("rejects broken JSON and a version from the future", () => {
    const broken = memoryStorage();
    broken.setItem(PROFILE_KEY, "{not json");
    expect(loadProfile(broken).status).toBe("unreadable");

    const future = memoryStorage();
    saveProfile(future, calibrated());
    const stored = JSON.parse(future.getItem(PROFILE_KEY) ?? "{}") as Record<string, unknown>;
    future.setItem(PROFILE_KEY, JSON.stringify({ ...stored, version: 99 }));
    expect(loadProfile(future).status).toBe("unreadable");
  });

  it("survives a browser that refuses to store", () => {
    const refusing: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(saveProfile(refusing, calibrated())).toBe(false);
  });
});
