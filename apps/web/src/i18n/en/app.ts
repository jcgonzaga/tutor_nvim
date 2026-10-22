/** English text of the app shell (header, notices, error screen). */
export const app = {
  /** Free practice with no exercise in the catalog. */
  noExercises: "No exercises found.",
  /** Storage problems shown above every screen. */
  notices: {
    unreadable:
      "Your saved progress could not be read, so a fresh profile was started. The old data was kept as a backup in this browser.",
    unsaved:
      "This browser is not letting the app save. You can keep practicing, but progress will be lost when you close the tab.",
    dismiss: "Dismiss",
  },
  /** Navigation and account link in the page header. */
  header: {
    navLabel: "Main",
    today: "Today",
    map: "Skill map",
    progress: "Progress",
    settings: "Settings",
    xp: (xp: number) => `${xp} XP`,
    account: "Account",
    signIn: "Sign in",
  },
  /** Fallback shown when a rendering error would otherwise blank the page. */
  errorBoundary: {
    title: "Something went wrong",
    body: "The app hit an unexpected problem. Your progress is saved on this device, and the error has been reported without any of your data.",
    reload: "Reload",
    backToToday: "Back to today",
  },
};
