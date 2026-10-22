/** English text of the session area. */
export const session = {
  /** Eyebrow when the item has no block. */
  eyebrowFallback: "Session",
  /** Added to the eyebrow when the exercise comes back in the same session. */
  repeatSuffix: " · again",
  progress: (done: number, total: number) => `${done} of ${total}`,
  giveUp: "I don't know this",
  continue: "Continue",
  finish: "Finish",
  /** What a personal best was about. */
  metrics: {
    time: "speed",
    efficiency: "efficiency",
    performance: "score",
    reaction: "reaction time",
  },
  newPersonalBest: (metrics: string) => `New personal best: ${metrics}`,
  missingExercise: {
    title: "Session",
    text: "This session refers to an exercise that no longer exists.",
    close: "Close session",
  },
  summary: {
    title: "Session complete",
    eyebrow: "Summary",
    exercises: "Exercises",
    exercisesValue: (solved: number, total: number) => `${solved} solved of ${total}`,
    averageScore: "Average score",
    reviewsCompleted: "Reviews completed",
    xp: "XP",
    xpValue: (xp: number) => `+${xp} XP`,
    xpBonus: (bonus: number) => `including ${bonus} for finishing today's session`,
    bestCombo: "Best combo",
    streak: "Streak",
    streakValue: (days: number, firstOfDay: boolean) =>
      `${days}-day streak${firstOfDay ? "" : " (today already counted)"}`,
    skillsTrained: "Skills trained",
    personalBests: "Personal bests",
    noRecords: "No new records this time. They show up when you beat an earlier solve.",
    done: "Done",
  },
};
