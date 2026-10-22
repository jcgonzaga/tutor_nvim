export { DEFAULT_PEDAGOGY_CONFIG, type PedagogyConfig } from "./config";
export {
  MASTERY_STAGES,
  EMPTY_LEARNER,
  stageRank,
  type AttemptOutcome,
  type AttemptRecord,
  type LearnerState,
  type MasteryStage,
  type ReviewState,
  type UserSkill,
} from "./types";
export { createUserSkill, getUserSkill } from "./userSkill";
export { computeMastery, deriveStage, masteryBlockers } from "./mastery";
export { availableSkills, isUnlocked, resolveStages, type StageMap } from "./unlock";
export { contextKey, isDelayedRecall, isTransferEvidence } from "./evidence";
export {
  enqueueInSession,
  isDue,
  retrievability,
  scheduleReview,
  takeDueInSession,
  type InSessionEntry,
  type ReviewAttempt,
  type ScheduleResult,
} from "./scheduler";
export {
  recordAttempt,
  refreshStages,
  type AttemptInput,
  type RecordResult,
  type SkillUpdate,
} from "./progress";
export {
  isExerciseAvailable,
  scoreExercise,
  type PriorityContext,
  type PriorityScore,
  type RecentPick,
} from "./priority";
export {
  SESSION_BLOCKS,
  buildDailySession,
  sessionItems,
  type DailySession,
  type SessionBlock,
  type SessionItem,
  type SessionRequest,
} from "./session";
export { createRng, hashString } from "./random";
export { DAY_MS, HOUR_MS } from "./math";
export {
  CALIBRATION_LADDER,
  EXPERIENCE_LEVELS,
  calibrationResult,
  isCalibrationDone,
  nextRung,
  pickCalibrationExercise,
  placedSkills,
  recordRung,
  startCalibration,
  type CalibrationRung,
  type CalibrationResult,
  type CalibrationState,
  type ExperienceLevel,
  type RungOutcome,
} from "./calibration";
export {
  NO_BEST,
  PERSONAL_BEST_METRICS,
  updatePersonalBest,
  type BestInput,
  type PersonalBest,
  type PersonalBestMetric,
} from "./personalBest";
export { recommendNext, type Recommendation } from "./recommend";
export {
  completeItem,
  currentItem,
  isRunFinished,
  runProgress,
  startSessionRun,
  summarizeRun,
  type CompleteOptions,
  type CompletedItem,
  type ItemResult,
  type RunItem,
  type SessionRun,
  type SessionSummary,
} from "./sessionRun";
export {
  KEYBOARD_LAYOUTS,
  PROFILE_VERSION,
  activeSessionFor,
  applyAttempt,
  completeOnboarding,
  completeSessionItem,
  completionsOn,
  finishAttempt,
  createProfile,
  endSession,
  setExperience,
  setKeyboardLayout,
  startSession,
  type ActiveSession,
  type AppliedAttempt,
  type FinishedAttempt,
  type FinishedAttemptResult,
  type RewardInput,
  type SessionRewards,
  type KeyboardLayout,
  type OnboardingState,
  type Profile,
  type ProfileSettings,
  type SessionHistoryEntry,
} from "./profile";

export {
  DEFAULT_GAMIFICATION_CONFIG,
  EMPTY_COMBO,
  EMPTY_GAMIFICATION,
  EMPTY_STREAK,
  addXp,
  awardAttemptXp,
  computeAttemptReward,
  completedToday,
  currentStreak,
  dayDiff,
  levelFor,
  recordCompletedDay,
  rememberBestRun,
  rememberRecentBest,
  updateCombo,
  xpOn,
  type AttemptReward,
  type AttemptRewardInput,
  type ComboChange,
  type ComboFacts,
  type ComboResult,
  type ComboState,
  type GamificationConfig,
  type GamificationState,
  type LevelProgress,
  type RecentBest,
  type RunRecord,
  type StreakState,
  type XpAward,
  type XpFacts,
  type XpKind,
  type XpPart,
} from "./gamification";
export { lessonsToShow, type LessonQuery } from "./lessons";
