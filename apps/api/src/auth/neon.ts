import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthIdentity, TokenVerifier } from "./verifier";

export interface NeonVerifierOptions {
  /** Base URL of the Neon Auth instance; its origin must match the token's issuer. */
  readonly baseUrl: string;
  readonly jwksUrl?: string;
}

/**
 * Verifies the short-lived EdDSA JWTs that Neon Auth (managed Better Auth) issues, against the
 * instance's JWKS. The key set is built once and cached/refreshed by `jose`. Any failure (bad
 * signature, wrong issuer, expired, malformed) is "not authenticated", never an exception.
 */
export function createNeonVerifier(options: NeonVerifierOptions): TokenVerifier {
  const issuer = new URL(options.baseUrl).origin;
  const jwksUrl = options.jwksUrl ?? `${options.baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`;
  const jwks = createRemoteJWKSet(new URL(jwksUrl));

  return {
    async verify(token: string): Promise<AuthIdentity | null> {
      try {
        const { payload } = await jwtVerify(token, jwks, { issuer });
        if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
        return {
          authUserId: payload.sub,
          email: typeof payload.email === "string" ? payload.email : null,
        };
      } catch {
        return null;
      }
    },
  };
}
