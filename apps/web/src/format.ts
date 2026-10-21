import type { Recommendation } from "@tutor-nvim/pedagogy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, unit: string): string => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** "now", "in 10 minutes", "in 3 hours", "in 2 days" for a moment relative to `now`. */
export function formatWhen(at: number, now: number): string {
  const delta = at - now;
  if (delta <= MINUTE) return "now";
  if (delta < HOUR) return `in ${plural(Math.round(delta / MINUTE), "minute")}`;
  if (delta < DAY) return `in ${plural(Math.round(delta / HOUR), "hour")}`;
  return `in ${plural(Math.round(delta / DAY), "day")}`;
}

/** One sentence for "what next", given a way to turn a skill slug into its title. */
export function describeRecommendation(
  recommendation: Recommendation,
  titleOf: (skillId: string) => string,
  now: number,
): string {
  switch (recommendation.kind) {
    case "review-due": {
      const names = recommendation.skillIds.map(titleOf);
      const shown = names.slice(0, 3).join(", ");
      const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
      return `${plural(names.length, "skill")} due for review: ${shown}${more}.`;
    }
    case "learn":
      return `Next new skill: ${titleOf(recommendation.skillId)}.`;
    case "next-review":
      return `Next review: ${titleOf(recommendation.skillId)} ${formatWhen(recommendation.at, now)}.`;
    case "all-caught-up":
      return "You are all caught up.";
  }
}
