import { currentStreak, type GamificationState } from "@tutor-nvim/pedagogy";
import type { ComboResult, XpAward } from "@tutor-nvim/pedagogy";
import { en } from "../i18n/en";
import type { Messages } from "../i18n/messages";

type Words = Messages["gamification"];

/** Where an award came from, in the learner's words. */
export const describeParts = (award: XpAward, words: Words = en.gamification): string[] =>
  award.parts.map((part) => `${words.xpKinds[part.kind]} +${part.amount}`);

/** One line about the combo after an attempt. A reset is a fresh start, never a scolding. */
export function describeCombo(result: ComboResult, words: Words = en.gamification): string {
  const { change, state } = result;
  switch (change.kind) {
    case "increased":
      return words.combo.increased(state.current);
    case "held":
      return state.current > 0 ? words.combo.kept(state.current) : words.combo.notStarted;
    case "reset":
      return change.reason === "failed"
        ? words.combo.resetFailed
        : change.reason === "strong-hint"
          ? words.combo.resetStrongHint
          : words.combo.resetAntiPattern;
  }
}

/**
 * The streak line for the home screen (T-803). It celebrates and invites; it never counts down or
 * warns of losing anything.
 */
export function describeStreak(
  game: GamificationState,
  today: string,
  words: Words = en.gamification,
): string {
  const { streak } = game;
  const shown = currentStreak(streak, today);
  if (shown > 0) return words.streak.days(shown);
  if (streak.longest > 0) return words.streak.welcomeBack(streak.longest);
  return words.streak.start;
}
