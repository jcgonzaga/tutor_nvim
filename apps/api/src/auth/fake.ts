import type { AuthIdentity, TokenVerifier } from "./verifier";

/**
 * Test/dev verifier: the token `test:<authUserId>` (optionally `test:<authUserId>:<email>`) is the
 * identity. It checks nothing, so `loadConfig` refuses it in production.
 */
export function createFakeVerifier(): TokenVerifier {
  return {
    async verify(token: string): Promise<AuthIdentity | null> {
      const [prefix, authUserId, email] = token.split(":");
      if (prefix !== "test" || !authUserId) return null;
      return { authUserId, email: email ?? null };
    },
  };
}

export const fakeToken = (authUserId: string, email?: string): string =>
  email ? `test:${authUserId}:${email}` : `test:${authUserId}`;
