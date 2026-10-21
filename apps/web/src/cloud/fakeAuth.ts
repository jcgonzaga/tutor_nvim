import { AuthError, type AuthClient } from "./auth";
import type { KeyValueStorage } from "../storage/profileStore";

const KEY = "tutor-nvim:fake-auth";

/**
 * Stand-in for Neon Auth, for E2E tests and local development against an API running with
 * `AUTH_MODE=fake`. The "password" is ignored and the token is `test:<email>`. It is loaded only
 * when `VITE_AUTH_MODE=fake`, never in a normal build.
 */
export function createFakeAuth(storage: KeyValueStorage): AuthClient {
  const read = () => storage.getItem(KEY);
  const user = () => {
    const email = read();
    return email ? { id: email, email } : null;
  };
  const signIn = async (email: string) => {
    if (!email.includes("@")) throw new AuthError("Enter a valid email");
    storage.setItem(KEY, email);
    return { id: email, email };
  };
  return {
    currentUser: async () => user(),
    signIn,
    signUp: signIn,
    async signOut() {
      storage.removeItem(KEY);
    },
    token: async () => {
      const email = read();
      return email ? `test:${email}` : null;
    },
  };
}
