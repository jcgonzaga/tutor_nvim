export { DEFAULT_GAMIFICATION_CONFIG, type GamificationConfig } from "./config";
export {
  EMPTY_COMBO,
  updateCombo,
  type ComboChange,
  type ComboFacts,
  type ComboResult,
  type ComboState,
} from "./combo";
export {
  EMPTY_STREAK,
  completedToday,
  currentStreak,
  dayDiff,
  recordCompletedDay,
  type StreakState,
} from "./streak";
export {
  awardAttemptXp,
  levelFor,
  type LevelProgress,
  type XpAward,
  type XpFacts,
  type XpKind,
  type XpPart,
} from "./xp";
export {
  EMPTY_GAMIFICATION,
  addXp,
  rememberBestRun,
  rememberRecentBest,
  xpOn,
  type GamificationState,
  type RecentBest,
  type RunRecord,
} from "./state";
export { computeAttemptReward, type AttemptReward, type AttemptRewardInput } from "./reward";
