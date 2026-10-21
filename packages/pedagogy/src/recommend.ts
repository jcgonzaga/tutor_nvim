import type { Skill } from "@tutor-nvim/exercise-schema";
import { DEFAULT_PEDAGOGY_CONFIG, type PedagogyConfig } from "./config";
import { isDue } from "./scheduler";
import type { LearnerState } from "./types";
import { resolveStages } from "./unlock";
import { getUserSkill } from "./userSkill";

/** What the learner should do next, for the end-of-session summary and the home screen. */
export type Recommendation =
  | { readonly kind: "review-due"; readonly skillIds: readonly string[] }
  | { readonly kind: "learn"; readonly skillId: string }
  | { readonly kind: "next-review"; readonly skillId: string; readonly at: number }
  | { readonly kind: "all-caught-up" };

/**
 * Due reviews first (the cheapest way to keep what was learned), then the next skill on the map,
 * then simply when the next review arrives. Deterministic: ties break by tier, then slug.
 */
export function recommendNext(
  skills: readonly Skill[],
  learner: LearnerState,
  now: number,
  config: PedagogyConfig = DEFAULT_PEDAGOGY_CONFIG,
): Recommendation {
  const ordered = [...skills]
    .filter((skill) => skill.enabled)
    .sort((a, b) => a.tier - b.tier || a.slug.localeCompare(b.slug));

  const due = ordered.filter((skill) => isDue(getUserSkill(learner, skill.slug), now));
  if (due.length > 0) return { kind: "review-due", skillIds: due.map((skill) => skill.slug) };

  const stages = resolveStages(skills, learner, config);
  const placed = new Set(learner.placed ?? []);
  const next = [...ordered]
    .sort((a, b) => Number(placed.has(a.slug)) - Number(placed.has(b.slug)))
    .find(
      (skill) =>
        stages[skill.slug] === "learning" && getUserSkill(learner, skill.slug).attemptCount === 0,
    );
  if (next) return { kind: "learn", skillId: next.slug };

  const upcoming = ordered
    .map((skill) => ({ skillId: skill.slug, at: getUserSkill(learner, skill.slug).nextReviewAt }))
    .filter((entry): entry is { skillId: string; at: number } => entry.at !== null)
    .sort((a, b) => a.at - b.at || a.skillId.localeCompare(b.skillId))[0];
  return upcoming ? { kind: "next-review", ...upcoming } : { kind: "all-caught-up" };
}
