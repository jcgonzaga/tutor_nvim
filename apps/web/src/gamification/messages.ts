import { currentStreak, type GamificationState } from "@tutor-nvim/pedagogy";
import type { ComboResult, XpAward, XpKind } from "@tutor-nvim/pedagogy";

const KIND_LABELS: Readonly<Record<XpKind, string>> = {
  completion: "Solved",
  perfect: "Perfect run",
  "scheduled-review": "Review done",
  transfer: "New context",
  "personal-best": "Personal best",
  "daily-completion": "Daily session",
};

/** Where an award came from, in the learner's words. */
export const describeParts = (award: XpAward): string[] =>
  award.parts.map((part) => `${KIND_LABELS[part.kind]} +${part.amount}`);

/** One line about the combo after an attempt. A reset is a fresh start, never a scolding. */
export function describeCombo(result: ComboResult): string {
  const { change, state } = result;
  switch (change.kind) {
    case "increased":
      return `Combo ×${state.current}`;
    case "held":
      return state.current > 0 ? `Combo ×${state.current} kept` : "Combo not started";
    case "reset":
      return change.reason === "failed"
        ? "Combo reset: a fresh start"
        : change.reason === "strong-hint"
          ? "Combo reset by a strong hint: a fresh start"
          : "Combo reset by an anti-pattern: a fresh start";
  }
}

/**
 * The streak line for the home screen (T-803). It celebrates and invites; it never counts down or
 * warns of losing anything.
 */
export function describeStreak(game: GamificationState, today: string): string {
  const { streak } = game;
  const shown = currentStreak(streak, today);
  if (shown > 0) return shown === 1 ? "1-day streak" : `${shown}-day streak`;
  if (streak.longest > 0) {
    return `Welcome back. Your longest streak was ${streak.longest} ${streak.longest === 1 ? "day" : "days"}; a new one starts with today's session.`;
  }
  return "Finish a session to start a streak.";
}
