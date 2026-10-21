import type { PedagogyConfig } from "./config";
import { clamp } from "./math";
import type { MasteryStage, UserSkill } from "./types";

type Evidence = Pick<
  UserSkill,
  "accuracy" | "strategy" | "fluency" | "retention" | "transfer" | "attemptCount"
>;

/**
 * Mastery v1 (PRD 28): a weighted sum of the five dimensions, scaled by confidence in the
 * number of attempts. Retention and transfer only move with delayed recall and transfer
 * evidence, so a skill drilled in one sitting tops out at the weights of the other three.
 */
export function computeMastery(skill: Evidence, config: PedagogyConfig): number {
  const { weights, attemptsForFullConfidence } = config.mastery;
  const raw =
    skill.accuracy * weights.accuracy +
    skill.strategy * weights.strategy +
    skill.fluency * weights.fluency +
    skill.retention * weights.retention +
    skill.transfer * weights.transfer;
  const confidence = clamp(skill.attemptCount / attemptsForFullConfidence, 0, 1);
  return clamp(raw * confidence);
}

/** Why a skill is not `mastered` yet (PRD 29). Empty means every criterion holds. */
export function masteryBlockers(skill: UserSkill, config: PedagogyConfig): string[] {
  const rules = config.stages.mastered;
  const blockers: string[] = [];
  const need = (label: string, value: number, min: number): void => {
    if (value < min) blockers.push(`${label} ${Math.round(value)} < ${min}`);
  };
  need("mastery", skill.mastery, rules.minMastery);
  need("accuracy", skill.accuracy, rules.minAccuracy);
  need("strategy", skill.strategy, rules.minStrategy);
  need("transfer", skill.transfer, rules.minTransfer);
  need("retention", skill.retention, rules.minRetention);
  need("delayed recalls", skill.delayedRecallCount, rules.minDelayedRecalls);
  need("transfer exercises", skill.transferCount, rules.minTransfers);
  return blockers;
}

/**
 * Stage transitions (T-403). The stage is derived from the evidence, not stored as a verdict:
 * `locked` until the prerequisites allow it, then `learning` → `practicing` → `fluent`, and
 * `mastered` only with delayed recall and transfer on top of the numbers. A learner who
 * starts failing falls back, which is what keeps `mastered` honest.
 */
export function deriveStage(
  skill: UserSkill,
  unlocked: boolean,
  config: PedagogyConfig,
): MasteryStage {
  if (!unlocked) return "locked";
  if (masteryBlockers(skill, config).length === 0) return "mastered";
  const fluent = config.stages.fluent;
  if (
    skill.mastery >= fluent.minMastery &&
    skill.accuracy >= fluent.minAccuracy &&
    skill.fluency >= fluent.minFluency
  ) {
    return "fluent";
  }
  const practicing = config.stages.practicing;
  if (skill.attemptCount >= practicing.minAttempts && skill.accuracy >= practicing.minAccuracy) {
    return "practicing";
  }
  return "learning";
}
