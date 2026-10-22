/** English text of the home area. */
export const home = {
  /** The headline action; it depends on whether a session is open, done or still to start. */
  session: {
    readyTitle: "Your session for today is ready",
    continueLabel: "Continue Training",
    readyDetail: "A short session built from what is due and what is next.",
    resumeTitle: "Pick up where you left off",
    inProgress: (done: number, total: number) => `Session in progress: ${done} of ${total} done.`,
    doneTitle: "Today's session is done",
    moreLabel: "Train more",
    doneDetail: "Today's session is done. Another one is optional.",
    daily: "Daily session",
    practiceSkill: "Or practice a specific skill",
  },
  progressAria: "Your progress",
  mastery: {
    title: "Mastery",
    summary: (total: number) => `of ${total} skills mastered`,
  },
  reviews: {
    title: "Scheduled reviews",
    subtitle: "They return just before you would forget",
    empty: "Nothing is scheduled yet. Reviews appear after you practice a skill.",
    buckets: {
      today: "Today",
      tomorrow: "Tomorrow",
      week: "This week",
      later: "Later",
    },
  },
  /** One bar per block of the session in progress. */
  blocks: {
    aria: "Session blocks",
    done: "Done",
    srDone: " (done)",
    srNow: " (now)",
    left: (n: number) => `${n} to go`,
    warmup: { name: "Warm-up", hint: "What you already know" },
    reviews: { name: "Reviews", hint: "Due now" },
    learn: { name: "Learn", hint: "Something new" },
    mixed: { name: "Mix", hint: "Choose between similar" },
    challenge: { name: "Challenge", hint: "A new context" },
  },
};
