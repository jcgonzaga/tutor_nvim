/** English text of the practice area. */
export const practice = {
  exit: "Exit",
  /** Eyebrow above the instruction when the caller gives none (free practice). */
  defaultEyebrow: "Challenge",
  editorLabel: "Vim practice editor",
  terminalLabel: "Shell practice terminal",
  terminalOutput: "Terminal output",
  pendingCommand: "pending command",
  cursorPosition: "cursor position",
  notAccepted: (key: string) => `${key} not accepted`,
  combo: "Combo",
  keys: (n: number) => `${n} ${n === 1 ? "key" : "keys"}`,
  focusHint: "Click the editor, or press Tab until it is focused, to start typing.",
  hintLabel: (level: number) => `Hint ${level}: `,
  showHint: "Show hint",
  hintSoon: "Hint available soon",
  /** Per-exercise feedback: icon plus words, the outcome is never carried by color alone. */
  feedback: {
    perfect: { title: "Perfect", detail: "Best strategy, no errors, no hints." },
    completed: { title: "Completed", detail: "Solved. There is a cleaner way." },
    failed: {
      title: "Not solved",
      detail: "That is useful information: it will come back for review.",
    },
    youTyped: "You typed",
    nothing: "(nothing)",
    oneWay: "One way",
    betterWay: "Better way",
    score: "Score",
    hintsUsed: (n: number) =>
      `${n === 1 ? "1 hint" : `${n} hints`} used: it counts less toward mastery.`,
  },
  /** The plain result table (free practice). */
  result: {
    success: "SUCCESS",
    notSolved: "NOT SOLVED",
    strategy: "Strategy",
    keystrokes: "Keystrokes",
    firstInput: "First input",
    duration: "Duration",
    efficiency: "Efficiency",
    performance: "Performance",
    errors: "Errors",
    hintsUsed: "Hints used",
    tryAgain: "Try again",
    nextExercise: "Next exercise",
    /** One line per habit the evaluation found; the short names live in `common.antiPatterns`. */
    antiPatterns: {
      repeated_x: "Repeated x: try a motion or operator that deletes more at once",
      excessive_hjkl: "Many h/j/k/l presses: look for a faster motion",
      arrow_keys: "Arrow keys: stay on the home row",
      insert_mode_navigation: "Moving around in INSERT mode: leave it with Esc first",
      repeated_escape: "Esc pressed repeatedly: once is enough",
      repeated_failed_command:
        "The same command failed again and again: read the error, then change it",
      cd_up_chain: "Several cd .. in a row: one path (cd ../..) gets you there at once",
      rm_rf_wildcard: "rm -r with a wildcard deletes a lot at once: name what you mean to remove",
    },
  },
};
