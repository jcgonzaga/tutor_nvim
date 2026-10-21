/**
 * The analytics catalogue (T-903). Every event is a name and a small bag of numbers and content
 * ids. There is deliberately no field that could hold what the learner typed, the text of a
 * buffer, a name, an e-mail or an account id: ids are the stable ids of skills and exercises.
 */
export type AnalyticsEvent =
  | { name: "session_started"; props: { items: number; reviews: number } }
  | {
      name: "session_completed";
      props: { exercises: number; successes: number; xp: number; streak: number };
    }
  | { name: "exercise_started"; props: { exerciseId: string; block: string; repeat: boolean } }
  | {
      name: "exercise_completed";
      props: {
        exerciseId: string;
        feedback: "perfect" | "completed";
        strategy: string;
        performance: number;
        durationMs: number;
        keystrokes: number;
        hintsUsed: number;
      };
    }
  | {
      name: "exercise_failed";
      props: { exerciseId: string; durationMs: number; keystrokes: number; hintsUsed: number };
    }
  | { name: "hint_used"; props: { exerciseId: string; level: number } }
  | { name: "skill_unlocked"; props: { skillId: string } }
  | { name: "skill_mastered"; props: { skillId: string } }
  | { name: "review_completed"; props: { skillId: string } }
  | { name: "personal_best"; props: { exerciseId: string; metrics: string[] } }
  | { name: "daily_streak"; props: { streak: number; longest: number } };

export type AnalyticsEventName = AnalyticsEvent["name"];

/** The events the plan lists (T-903), so a test can fail if one is dropped. */
export const EVENT_NAMES = [
  "session_started",
  "session_completed",
  "exercise_started",
  "exercise_completed",
  "exercise_failed",
  "hint_used",
  "skill_unlocked",
  "skill_mastered",
  "review_completed",
  "personal_best",
  "daily_streak",
] as const satisfies readonly AnalyticsEventName[];

/** What goes over the wire. */
export interface AnalyticsEnvelope {
  readonly installId: string;
  readonly events: readonly {
    readonly name: AnalyticsEventName;
    readonly at: number;
    readonly props: Readonly<Record<string, unknown>>;
  }[];
  readonly build?: string;
}
