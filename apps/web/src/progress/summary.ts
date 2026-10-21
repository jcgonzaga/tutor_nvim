import type { Skill } from "@tutor-nvim/exercise-schema";
import {
  DEFAULT_PEDAGOGY_CONFIG,
  MASTERY_STAGES,
  getUserSkill,
  isDue,
  resolveStages,
  type MasteryStage,
  type PedagogyConfig,
  type Profile,
} from "@tutor-nvim/pedagogy";

export interface ProgressSummary {
  readonly skillCount: number;
  readonly stageCounts: Readonly<Record<MasteryStage, number>>;
  /** Sessions finished (abandoned ones are not counted). */
  readonly sessionsCompleted: number;
  readonly lastSessionDate: string | null;
  readonly attempts: number;
  /** Share of recorded attempts that solved the exercise, 0-100; `null` before any attempt. */
  readonly successRate: number | null;
  readonly reviewsDue: number;
  /** Earliest scheduled review that is not due yet; `null` when nothing is scheduled ahead. */
  readonly nextReviewAt: number | null;
}

/** The minimal progress dashboard (T-523): where the learner stands, nothing decorative. */
export function summarizeProgress(
  profile: Profile,
  skills: readonly Skill[],
  now: number,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): ProgressSummary {
  const stages = resolveStages(skills, profile.learner, config);
  const enabled = skills.filter((skill) => skill.enabled);
  const stageCounts = Object.fromEntries(MASTERY_STAGES.map((stage) => [stage, 0])) as Record<
    MasteryStage,
    number
  >;
  for (const skill of enabled) stageCounts[stages[skill.slug] ?? "locked"] += 1;

  const states = enabled.map((skill) => getUserSkill(profile.learner, skill.slug));
  const upcoming = states
    .map((state) => state.nextReviewAt)
    .filter((at): at is number => at !== null && at > now);

  const finished = profile.sessions.filter((entry) => !entry.abandoned);
  const solved = profile.history.filter((attempt) => attempt.success).length;
  return {
    skillCount: enabled.length,
    stageCounts,
    sessionsCompleted: finished.length,
    lastSessionDate: finished[finished.length - 1]?.date ?? null,
    attempts: profile.history.length,
    successRate:
      profile.history.length === 0 ? null : Math.round((solved / profile.history.length) * 100),
    reviewsDue: states.filter((state) => isDue(state, now)).length,
    nextReviewAt: upcoming.length === 0 ? null : Math.min(...upcoming),
  };
}
