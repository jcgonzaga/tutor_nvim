/** English text of the progress area. */
export const progress = {
  title: "Progress",
  eyebrow: "Tutor NeoVim",
  sessions: "Sessions completed",
  attempts: "Exercises attempted",
  solved: "Solved",
  xp: "XP",
  xpLevel: (xp: number, level: number) => `${xp} XP · level ${level}`,
  streak: "Streak",
  streakValue: (days: number, longest: number) =>
    `${days} ${days === 1 ? "day" : "days"} (longest ${longest})`,
  bestCombo: "Best combo",
  reviewsDue: "Reviews due now",
  nextReview: "Next review",
  nothingAhead: "Nothing scheduled ahead",
  skills: (count: number) => `Skills (${count})`,
  backToToday: "Back to today",
  skillMap: "Skill map",
};
