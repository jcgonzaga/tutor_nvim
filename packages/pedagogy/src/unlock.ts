import type { Skill } from "@tutor-nvim/exercise-schema";
import type { PedagogyConfig } from "./config";
import { deriveStage } from "./mastery";
import { stageRank, type LearnerState, type MasteryStage } from "./types";
import { getUserSkill } from "./userSkill";

export type StageMap = Readonly<Record<string, MasteryStage>>;

/**
 * Prerequisite unlock engine (T-404). A skill is available only when every prerequisite has
 * reached `config.unlock.minPrerequisiteStage`; roots (no prerequisites) are always available.
 *
 * Stage and availability depend on each other (a prerequisite must itself be unlocked), so the
 * graph is resolved recursively with memoization. Content validation rejects cycles; a cycle
 * that slips through leaves its members locked instead of looping.
 *
 * Disabled skills are not part of the graph: they are `locked`, and a prerequisite pointing at
 * one is ignored rather than blocking its dependents forever.
 */
export function resolveStages(
  skills: readonly Skill[],
  learner: LearnerState,
  config: PedagogyConfig,
): StageMap {
  const bySlug = new Map(skills.map((skill) => [skill.slug, skill]));
  const stages = new Map<string, MasteryStage>();
  const visiting = new Set<string>();
  const needed = stageRank(config.unlock.minPrerequisiteStage);

  const stageOf = (slug: string): MasteryStage => {
    const known = stages.get(slug);
    if (known !== undefined) return known;
    const skill = bySlug.get(slug);
    if (skill === undefined || visiting.has(slug)) return "locked";
    if (!skill.enabled) {
      stages.set(slug, "locked");
      return "locked";
    }

    visiting.add(slug);
    const unlocked = skill.prerequisites.every((prerequisite) => {
      const required = bySlug.get(prerequisite);
      if (required === undefined || !required.enabled) return true;
      return stageRank(stageOf(prerequisite)) >= needed;
    });
    visiting.delete(slug);

    const stage = deriveStage(getUserSkill(learner, slug), unlocked, config);
    stages.set(slug, stage);
    return stage;
  };

  for (const skill of skills) stageOf(skill.slug);
  return Object.fromEntries(stages);
}

export function isUnlocked(stages: StageMap, slug: string): boolean {
  const stage = stages[slug];
  return stage !== undefined && stage !== "locked";
}

/** Slugs of the enabled skills the learner may work on now, in catalog order. */
export function availableSkills(skills: readonly Skill[], stages: StageMap): string[] {
  return skills.filter((skill) => isUnlocked(stages, skill.slug)).map((skill) => skill.slug);
}
