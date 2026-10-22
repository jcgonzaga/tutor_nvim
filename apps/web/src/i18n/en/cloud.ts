/** English text of the account and sync area. */
export const cloud = {
  title: "Account",
  signInTitle: "Sign in",
  signUpTitle: "Create an account",
  back: "Back to today",
  defaultName: "Learner",
  notConfigured: "Accounts are not set up in this version. Your progress is saved on this device.",
  signedOutLine: "Sign in to keep your progress across devices.",
  status: {
    "signed-out": "Not syncing",
    idle: "Waiting to sync",
    syncing: "Syncing…",
    synced: "Everything is saved to your account",
    offline: "Offline: progress is saved on this device and will upload when you are back online",
    error: "Could not sync. Your progress is safe on this device; it will retry",
  },
  notices: {
    skipped: (count: number) => `${count} attempt(s) could not be saved and were skipped.`,
    expired: "Your sign-in expired. Sign in again to keep syncing.",
  },
  scope:
    "Your skills, reviews and mastery follow your account. XP, streak and records stay on this device for now.",
  syncNow: "Sync now",
  signOut: "Sign out",
  intro: "An account keeps your progress across devices. You can keep practicing without one.",
  fields: {
    name: "Name",
    email: "Email",
    password: "Password",
  },
  signIn: "Sign in",
  signUp: "Create account",
  needAccount: "I need an account",
  haveAccount: "I already have an account",
  errors: {
    unreachable: "Could not reach the sign-in service",
    unavailable: "Sign-in is not available yet",
    invalidEmail: "Enter a valid email",
    signInFailed: "Could not sign in",
    noSession: "Signed in, but no session was returned",
  },
};
