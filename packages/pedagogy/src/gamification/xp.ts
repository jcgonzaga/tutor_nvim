import { DEFAULT_GAMIFICATION_CONFIG, type GamificationConfig } from "./config";

export type XpKind =
  "completion" | "perfect" | "scheduled-review" | "transfer" | "personal-best" | "daily-completion";

/** What XP may know about an attempt. Notice what is missing: any mastery value. */
export interface XpFacts {
  readonly success: boolean;
  readonly feedback: "perfect" | "completed" | "failed";
  readonly hintsUsed: number;
  readonly scheduledReview: boolean;
  readonly transferEvidence: boolean;
  /** Personal-best metrics this attempt improved. */
  readonly personalBests: number;
  /** Earlier successes at this same exercise on the same day. */
  readonly priorCompletionsToday: number;
  /** Attempt XP already earned today (for the daily cap). */
  readonly xpToday: number;
  /** The combo after this attempt; 1 for the first execution in a row. */
  readonly combo: number;
}

export interface XpPart {
  readonly kind: XpKind;
  readonly amount: number;
}

export interface XpAward {
  /** XP actually granted: after decay, combo bonus and the daily cap. */
  readonly total: number;
  /** Before decay, combo and cap, so the learner can see where it came from. */
  readonly parts: readonly XpPart[];
  /** 1 for a first success; lower for the same exercise repeated today. */
  readonly repeatFactor: number;
  /** 1 plus the combo bonus. */
  readonly comboMultiplier: number;
  /** The daily cap cut this award. */
  readonly capped: boolean;
}

const NOTHING: XpAward = {
  total: 0,
  parts: [],
  repeatFactor: 1,
  comboMultiplier: 1,
  capped: false,
};

/**
 * XP for one attempt (T-801). Pure and deterministic.
 *
 * - A failed attempt earns nothing: speed or activity without correctness is not rewarded.
 * - Hints shrink the completion XP, a perfect run adds a bonus, due reviews and transfer pay more.
 * - Repeating one exercise the same day pays less each time (then nothing), and attempt XP stops at
 *   a daily cap, so grinding cannot farm it. Personal bests are exempt from the repeat decay:
 *   they require an actual improvement.
 * - The combo adds a bounded bonus.
 *
 * XP reads facts about the attempt, never a mastery value, and nothing here writes to learner
 * state: farming XP cannot buy mastery (AGENTS 2.7, 15).
 */
export function awardAttemptXp(
  facts: XpFacts,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): XpAward {
  if (!facts.success) return NOTHING;
  const xp = config.xp;

  const completion = Math.round(xp.completion * Math.max(0, 1 - xp.hintPenalty * facts.hintsUsed));
  const parts: XpPart[] = [{ kind: "completion", amount: completion }];
  if (facts.feedback === "perfect") parts.push({ kind: "perfect", amount: xp.perfectBonus });
  if (facts.scheduledReview)
    parts.push({ kind: "scheduled-review", amount: xp.scheduledReviewBonus });
  if (facts.transferEvidence) parts.push({ kind: "transfer", amount: xp.transferBonus });
  const paidBests = Math.min(facts.personalBests, xp.maxPersonalBestMetrics);
  if (paidBests > 0)
    parts.push({ kind: "personal-best", amount: paidBests * xp.personalBestBonus });

  const repeatFactor = xp.repeatFactors[facts.priorCompletionsToday] ?? 0;
  const decayed = parts
    .filter((part) => part.kind !== "personal-best")
    .reduce((sum, part) => sum + part.amount, 0);
  const bests = parts
    .filter((part) => part.kind === "personal-best")
    .reduce((sum, part) => sum + part.amount, 0);

  const comboMultiplier =
    1 + Math.min(xp.comboBonusMax, Math.max(0, facts.combo - 1) * xp.comboBonusPerStep);
  const raw = Math.round((decayed * repeatFactor + bests) * comboMultiplier);
  const room = Math.max(0, xp.dailyCap - facts.xpToday);
  const total = Math.min(raw, room);

  return { total, parts, repeatFactor, comboMultiplier, capped: total < raw };
}

/** XP and level are display values: a level is just a name for a total. */
export interface LevelProgress {
  readonly level: number;
  /** XP earned inside the current level. */
  readonly into: number;
  /** XP the current level needs to be completed. */
  readonly needed: number;
}

export function levelFor(
  totalXp: number,
  config: GamificationConfig = DEFAULT_GAMIFICATION_CONFIG,
): LevelProgress {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  for (;;) {
    const needed = Math.round(config.level.base * level ** config.level.growth);
    if (remaining < needed) return { level, into: remaining, needed };
    remaining -= needed;
    level += 1;
  }
}
