import type { Exercise, Skill } from "@tutor-nvim/exercise-schema";

/**
 * Calibration engine (T-504, PRD 42): a short adaptive check that finds where on a small ladder
 * of skills the learner stands, so the first session starts in the right place.
 *
 * The ladder climbs from `hjkl` through mode switching and word movement to operators. The
 * check is a staircase: it probes one rung, goes up after a pass and down after a failure, and
 * stops as soon as the boundary is known (a pass directly under a failure), so a clear case takes
 * two or three probes rather than all four.
 *
 * The self-reported experience only decides *which rung to probe first* (T-503). Nothing here
 * grants mastery: probe results are ordinary attempts that the caller feeds to `recordAttempt`.
 */
export const EXPERIENCE_LEVELS = ["never", "basics", "occasional", "regular"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export interface CalibrationRung {
  /** What the rung checks, in the learner's words. */
  readonly topic: string;
  readonly skillId: string;
}

export const CALIBRATION_LADDER: readonly CalibrationRung[] = [
  { topic: "hjkl", skillId: "vim.navigation.atomic" },
  { topic: "mode switch", skillId: "vim.mode.insert" },
  { topic: "word movement", skillId: "vim.navigation.words" },
  { topic: "operator", skillId: "vim.operator.delete" },
];

/** Rung probed first, by self-reported experience. */
const START_RUNG: Readonly<Record<ExperienceLevel, number>> = {
  never: 0,
  basics: 1,
  occasional: 2,
  regular: 3,
};

export interface CalibrationState {
  readonly experience: ExperienceLevel;
  /** Per rung: `true` passed, `false` failed, `null` not probed. */
  readonly results: readonly (boolean | null)[];
  /** The rung probed most recently; `null` before the first probe. */
  readonly lastRung: number | null;
}

export function startCalibration(
  experience: ExperienceLevel,
  rungs: number = CALIBRATION_LADDER.length,
): CalibrationState {
  return { experience, results: Array.from({ length: rungs }, () => null), lastRung: null };
}

/** The next rung to probe, or `null` when the boundary is known and the check is over. */
export function nextRung(state: CalibrationState): number | null {
  const { results, lastRung } = state;
  if (lastRung === null) return Math.min(START_RUNG[state.experience], results.length - 1);

  const step = results[lastRung] === true ? 1 : -1;
  const candidate = lastRung + step;
  const inRange = candidate >= 0 && candidate < results.length;
  return inRange && results[candidate] === null ? candidate : null;
}

export const isCalibrationDone = (state: CalibrationState): boolean => nextRung(state) === null;

export function recordRung(
  state: CalibrationState,
  rung: number,
  passed: boolean,
): CalibrationState {
  if (rung < 0 || rung >= state.results.length) throw new RangeError(`No rung ${rung}`);
  return {
    ...state,
    results: state.results.map((result, index) => (index === rung ? passed : result)),
    lastRung: rung,
  };
}

export type RungOutcome = "passed" | "failed" | "assumed" | "untested";

export interface CalibrationResult {
  readonly experience: ExperienceLevel;
  /** Highest rung passed, or -1 when even the first one failed. */
  readonly placedRung: number;
  readonly rungs: readonly (CalibrationRung & { readonly outcome: RungOutcome })[];
  readonly probes: number;
}

/**
 * The initial skill estimate (PRD 41). Rungs below the highest pass that were never probed are
 * `assumed`: it is a placement guess shown to the learner, not evidence.
 */
export function calibrationResult(
  state: CalibrationState,
  ladder: readonly CalibrationRung[] = CALIBRATION_LADDER,
): CalibrationResult {
  const placedRung = state.results.lastIndexOf(true);
  return {
    experience: state.experience,
    placedRung,
    probes: state.results.filter((result) => result !== null).length,
    rungs: ladder.map((rung, index) => {
      const result = state.results[index] ?? null;
      const outcome: RungOutcome =
        result === true
          ? "passed"
          : result === false
            ? "failed"
            : index < placedRung
              ? "assumed"
              : "untested";
      return { ...rung, outcome };
    }),
  };
}

/** `skillId` and everything it builds on, following prerequisites. */
function withAncestors(skills: readonly Skill[], skillId: string): Set<string> {
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));
  const found = new Set<string>();
  const visit = (slug: string): void => {
    if (found.has(slug)) return;
    found.add(slug);
    for (const prerequisite of bySlug.get(slug)?.prerequisites ?? []) visit(prerequisite);
  };
  visit(skillId);
  return found;
}

/**
 * The easiest exercise that trains `skillId` using only that skill and what it builds on, so a
 * probe never tests something the learner has not been asked about yet. `null` if content has none.
 */
export function pickCalibrationExercise(
  skills: readonly Skill[],
  exercises: readonly Exercise[],
  skillId: string,
): Exercise | null {
  const allowed = withAncestors(skills, skillId);
  return (
    [...exercises]
      .filter(
        (exercise) =>
          exercise.skillIds.includes(skillId) && exercise.skillIds.every((id) => allowed.has(id)),
      )
      .sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id))[0] ?? null
  );
}

/**
 * The skills calibration places the learner past: every rung up to the highest pass (tested or
 * assumed) and everything those skills build on. Feeds `LearnerState.placed`.
 */
export function placedSkills(skills: readonly Skill[], result: CalibrationResult): string[] {
  const known = new Set(skills.map((skill) => skill.slug));
  const placed = new Set<string>();
  for (const rung of result.rungs) {
    if (rung.outcome !== "passed" && rung.outcome !== "assumed") continue;
    for (const slug of withAncestors(skills, rung.skillId)) if (known.has(slug)) placed.add(slug);
  }
  return [...placed].sort();
}
