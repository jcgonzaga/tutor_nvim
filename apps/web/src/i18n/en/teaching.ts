/** English text of the theory cards and the explanation shown after a poor attempt. */
export const teaching = {
  lesson: {
    eyebrow: (skill: string) => `New skill: ${skill}`,
    region: (skill: string) => `Theory: ${skill}`,
    progress: (current: number, total: number) => `Card ${current} of ${total}`,
    next: "Next",
    back: "Back",
    start: "Got it, let's practice",
    skip: "Skip theory",
    keysLabel: "Keys",
  },
  explanation: {
    heading: "Why?",
    unsolved: "This one was not solved. Here is how it works:",
    lowScore: "You solved it, but there was a much easier way:",
    habits: "Habits to fix",
    theory: (skill: string) => `Review the theory: ${skill}`,
  },
  skillPage: {
    heading: "Theory",
    show: "Review the theory",
  },
};
