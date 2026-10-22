export interface AuthUser {
  readonly id: string;
  readonly email: string;
}

/**
 * The app's own sign-in problems. Text written by the auth server cannot be translated, so it
 * travels as `message` with no code; the app's fallbacks carry a code the screen maps to the
 * catalog (the English `message` stays for logs and tests).
 */
export type AuthErrorCode = "unavailable" | "invalidEmail" | "signInFailed" | "noSession";

/** A sign-in problem the learner can act on ("wrong password"), not a crash. */
export class AuthError extends Error {
  readonly code: AuthErrorCode | undefined;

  constructor(message: string, code?: AuthErrorCode) {
    super(message);
    this.code = code;
  }
}

/**
 * The web app's only view of authentication. Neon Auth is behind it in production and a stand-in
 * in tests, so no screen knows which. The token is what the API verifies (ADR-0001).
 */
export interface AuthClient {
  currentUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string, name: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  /** A JWT for the API, or `null` when signed out. */
  token(): Promise<string | null>;
}
