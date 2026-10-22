/** English text shared across screens: vocabulary that must read the same everywhere. */
export const common = {
  appName: "Tutor NeoVim",
  language: {
    label: "Language",
    help: "Language of the interface and of the exercises. You can change it at any time.",
  },
  /** Mastery stages of a skill. */
  stages: {
    locked: "Locked",
    learning: "Learning",
    practicing: "Practicing",
    fluent: "Fluent",
    mastered: "Mastered",
  },
  /** How a solution is classified (PRD §22). */
  strategies: {
    optimal: "Optimal",
    efficient: "Efficient",
    valid: "Valid",
    inefficient: "Inefficient",
    "anti-pattern": "Bad habit",
    failed: "Not solved",
  },
  /**
   * Habits the evaluation detects. `name` labels the finding; `explain` says what to do instead,
   * and appears in the explanation shown after a poor attempt.
   */
  antiPatterns: {
    repeated_x: {
      name: "Repeated x",
      explain:
        "You pressed x many times in a row. To remove a word or a line use an operator (dw, dd): one command, and one undo step.",
    },
    excessive_hjkl: {
      name: "Too many h j k l",
      explain:
        "You moved one cell at a time. Jump with words (w, b, e), to the line ends (0, $) or to a character (f, t): far fewer keys.",
    },
    arrow_keys: {
      name: "Arrow keys",
      explain:
        "Arrow keys work, but they pull your hand away from the home row. Use h j k l, or better a motion that lands where you want.",
    },
    insert_mode_navigation: {
      name: "Moving in INSERT mode",
      explain:
        "You moved the cursor while in INSERT mode. Press Esc, move in NORMAL mode, and re-enter INSERT only where you need to type.",
    },
    repeated_escape: {
      name: "Repeated Esc",
      explain:
        "One Esc is enough to return to NORMAL mode. Pressing it again does nothing, and it costs keystrokes.",
    },
    repeated_failed_command: {
      name: "Same failing command",
      explain:
        "You ran the same command again after it failed. Read the error message first: it usually says what is wrong (a name, a path, a missing option).",
    },
    cd_up_chain: {
      name: "Chain of cd ..",
      explain:
        "You went up one folder at a time. A path does it in one go: cd ../.. goes up two levels, and cd ~ or cd alone goes home.",
    },
    rm_rf_wildcard: {
      name: "rm -rf with a wildcard",
      explain:
        "rm -rf with a wildcard deletes without asking and cannot be undone. Name exactly what you want to remove, and use ls first to check it.",
    },
  },
  /** Kinds of exercise (PRD §8 stages). */
  exerciseModes: {
    learn: "Discover",
    imitate: "Imitate",
    recall: "Recall",
    discriminate: "Discriminate",
    transfer: "Transfer",
    rush: "Rush",
    mission: "Mission",
  },
  /** Blocks of the daily session. */
  sessionBlocks: {
    warmup: "Warm-up",
    review: "Review",
    learn: "Learn",
    mixed: "Mixed",
    challenge: "Challenge",
  },
  domains: {
    linux: "Linux",
    vim: "Vim",
    neovim: "Neovim",
    lazyvim: "LazyVim",
  },
  /** Moments relative to now ("in 3 hours"). */
  time: {
    now: "now",
    inMinutes: (n: number) => `in ${n} ${n === 1 ? "minute" : "minutes"}`,
    inHours: (n: number) => `in ${n} ${n === 1 ? "hour" : "hours"}`,
    inDays: (n: number) => `in ${n} ${n === 1 ? "day" : "days"}`,
  },
  /** One sentence for "what next" (home and session summary). */
  recommendation: {
    reviewDue: (count: number, shown: string, more: number) =>
      `${count} ${count === 1 ? "skill" : "skills"} due for review: ${shown}${more > 0 ? ` and ${more} more` : ""}.`,
    learn: (title: string) => `Next new skill: ${title}.`,
    nextReview: (title: string, when: string) => `Next review: ${title} ${when}.`,
    allCaughtUp: "You are all caught up.",
  },
};
