import type { AttemptEvaluation } from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import {
  type FinishedAttemptResult,
  type MasteryStage,
  type Profile,
  type SessionSummary,
} from "@tutor-nvim/pedagogy";
import type { AnalyticsEvent } from "./events";

const stageOf = (profile: Profile, skillId: string): MasteryStage =>
  profile.learner.skills[skillId]?.stage ?? "locked";

/**
 * The events one finished attempt produced, found by comparing the profile before and after it:
 * a skill that went from locked to open was unlocked by this attempt, one that reached `mastered`
 * was mastered by it. Pure: it reads two profiles and the result, and sends nothing.
 */
export function eventsForAttempt(input: {
  readonly exercise: Pick<Exercise, "id">;
  readonly evaluation: AttemptEvaluation;
  readonly feedback: "perfect" | "completed" | "failed";
  readonly keystrokes: number;
  readonly before: Profile;
  readonly after: Profile;
  readonly result: Pick<FinishedAttemptResult, "improved" | "updates">;
}): AnalyticsEvent[] {
  const { exercise, evaluation, feedback, before, after, result } = input;
  const { metrics } = evaluation;
  const events: AnalyticsEvent[] = [];

  if (evaluation.success && feedback !== "failed") {
    events.push({
      name: "exercise_completed",
      props: {
        exerciseId: exercise.id,
        feedback,
        strategy: evaluation.strategy,
        performance: Math.round(metrics.performanceScore),
        durationMs: Math.round(metrics.totalDurationMs),
        keystrokes: input.keystrokes,
        hintsUsed: metrics.hintsUsed,
      },
    });
  } else {
    events.push({
      name: "exercise_failed",
      props: {
        exerciseId: exercise.id,
        durationMs: Math.round(metrics.totalDurationMs),
        keystrokes: input.keystrokes,
        hintsUsed: metrics.hintsUsed,
      },
    });
  }

  for (const update of result.updates) {
    if (update.scheduledReview) {
      events.push({ name: "review_completed", props: { skillId: update.skillId } });
    }
  }
  if (result.improved.length > 0) {
    events.push({
      name: "personal_best",
      props: { exerciseId: exercise.id, metrics: [...result.improved] },
    });
  }

  for (const skillId of Object.keys(after.learner.skills)) {
    const was = stageOf(before, skillId);
    const now = stageOf(after, skillId);
    if (was === "locked" && now !== "locked") {
      events.push({ name: "skill_unlocked", props: { skillId } });
    }
    if (was !== "mastered" && now === "mastered") {
      events.push({ name: "skill_mastered", props: { skillId } });
    }
  }
  return events;
}

/** The events of finishing the daily session: its summary and, once a day, the streak. */
export function eventsForCompletedSession(input: {
  readonly summary: Pick<SessionSummary, "exercises" | "successes" | "xp">;
  readonly rewards: {
    readonly dailyBonusXp: number;
    readonly streak: number;
    readonly longestStreak: number;
    readonly firstOfDay: boolean;
  };
}): AnalyticsEvent[] {
  const { summary, rewards } = input;
  const events: AnalyticsEvent[] = [
    {
      name: "session_completed",
      props: {
        exercises: summary.exercises,
        successes: summary.successes,
        xp: summary.xp + rewards.dailyBonusXp,
        streak: rewards.streak,
      },
    },
  ];
  if (rewards.firstOfDay) {
    events.push({
      name: "daily_streak",
      props: { streak: rewards.streak, longest: rewards.longestStreak },
    });
  }
  return events;
}
