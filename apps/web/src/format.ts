import type { Recommendation } from "@tutor-nvim/pedagogy";
import { en } from "./i18n/en";
import type { Messages } from "./i18n/messages";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Words = Messages["common"];

/** "now", "in 10 minutes", "in 3 hours", "in 2 days" for a moment relative to `now`. */
export function formatWhen(at: number, now: number, words: Words = en.common): string {
  const delta = at - now;
  if (delta <= MINUTE) return words.time.now;
  if (delta < HOUR) return words.time.inMinutes(Math.round(delta / MINUTE));
  if (delta < DAY) return words.time.inHours(Math.round(delta / HOUR));
  return words.time.inDays(Math.round(delta / DAY));
}

/** One sentence for "what next", given a way to turn a skill slug into its title. */
export function describeRecommendation(
  recommendation: Recommendation,
  titleOf: (skillId: string) => string,
  now: number,
  words: Words = en.common,
): string {
  switch (recommendation.kind) {
    case "review-due": {
      const names = recommendation.skillIds.map(titleOf);
      const shown = names.slice(0, 3).join(", ");
      return words.recommendation.reviewDue(names.length, shown, Math.max(0, names.length - 3));
    }
    case "learn":
      return words.recommendation.learn(titleOf(recommendation.skillId));
    case "next-review":
      return words.recommendation.nextReview(
        titleOf(recommendation.skillId),
        formatWhen(recommendation.at, now, words),
      );
    case "all-caught-up":
      return words.recommendation.allCaughtUp;
  }
}
