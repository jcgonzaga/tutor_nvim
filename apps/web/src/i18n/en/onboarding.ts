/** English text of the onboarding area. */
export const onboarding = {
  /** Names of the five steps, in order (the shell's progress list). */
  steps: {
    welcome: "Welcome",
    keyboard: "Keyboard",
    experience: "Experience",
    check: "Check",
    start: "Starting point",
  },
  shell: {
    stepsLabel: "Steps",
    done: "(done)",
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    eyebrow: "Setup",
  },
  titles: {
    welcome: "Welcome to Tutor NeoVim",
    layout: "Which keyboard do you use?",
    experience: "Your experience",
    estimate: "Your starting point",
  },
  layoutLead:
    "Vim's commands are the same on every keyboard. What changes is where some keys sit, so we can teach you to press them with the right finger.",
  welcome: {
    intro:
      "You will learn Vim by doing: short exercises on a real keyboard, a few minutes a day. Two quick questions and a short check set where you start.",
    local: "Everything stays on this device. No account is needed.",
    getStarted: "Get started",
    haveAccount: "I already have an account",
  },
  layout: {
    detectPrompt: "Click here and type a double quote:",
    detected: (name: string) => `Detected: ${name}`,
    notDetected: "Could not tell from that key. Pick your layout below.",
    waiting: "Waiting for a key press (optional).",
    legend: "Keyboard layout",
    /** Layout names; the keys inside stay as they are. */
    names: {
      "us-ansi": "US ANSI",
      "es-iso": "ES ISO (Spanish)",
    },
    options: {
      "es-iso": {
        note: "The usual Spanish layout",
        quote: "Shift + 2",
        semicolon: "Shift + ,",
        paren: "Shift + 8",
      },
      "us-ansi": {
        note: "The one most Vim tutorials assume",
        quote: "Shift + ' (right of ;)",
        semicolon: "One key, no Shift",
        paren: "Shift + 9",
      },
    },
    howYouType: "How you type",
    changeLater:
      "You can change this any time. Your level is not decided here: a one-minute check measures it.",
    back: "Back",
    next: "Continue",
  },
  experience: {
    question: "How much Vim do you know?",
    levels: {
      never: "I have never used Vim",
      basics: "I know the basics (h j k l, i, Esc)",
      occasional: "I use Vim from time to time",
      regular: "I use Vim regularly",
    },
    note: "This only decides where the short check starts. It never unlocks anything on its own: what you show in the check does.",
    back: "Back",
    startCheck: "Start the check",
    skipCheck: "Skip the check, start from the beginning",
  },
  calibration: {
    seeStart: "See your starting point",
    eyebrow: "Quick check",
    progress: (n: number) => `Check ${n}`,
    giveUp: "I don't know this yet",
    next: "Continue",
  },
  estimate: {
    skipped:
      "You skipped the check, so you start at the very beginning. The first sessions are short.",
    fromBeginning:
      "You will start from the very beginning. This is a starting point, not a grade: skills are only mastered through practice over time.",
    pastShown:
      "You will start past what you already showed. This is a starting point, not a grade: skills are only mastered through practice over time.",
    outcomes: {
      passed: "Solved",
      failed: "Not yet",
      assumed: "Assumed from what you solved",
      untested: "Not checked",
    },
    /** What each rung of the check was about, by skill id. */
    topics: {
      "vim.navigation.atomic": "hjkl",
      "vim.mode.insert": "mode switch",
      "vim.navigation.words": "word movement",
      "vim.operator.delete": "operator",
    },
    start: "Start training",
  },
};
