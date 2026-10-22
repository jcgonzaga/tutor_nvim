import { en } from "../i18n/en";
import type { Messages } from "../i18n/messages";

const BLOCKER = /^(.+) (-?\d+) < (\d+)$/;

/**
 * Pedagogy reports why a skill is not mastered yet as English text, "<criterion> <value> < <minimum>"
 * (`masteryBlockers`). This puts the criterion in the learner's language; a blocker in any other
 * shape is shown as received, so a new criterion degrades to English instead of disappearing.
 */
export function describeBlocker(
  blocker: string,
  words: Messages["map"]["detail"]["blockerCriteria"] = en.map.detail.blockerCriteria,
): string {
  const match = BLOCKER.exec(blocker);
  const criterion = match?.[1];
  if (!match || criterion === undefined || !Object.hasOwn(words, criterion)) return blocker;
  const name = words[criterion as keyof typeof words];
  return `${name} ${match[2]} < ${match[3]}`;
}
