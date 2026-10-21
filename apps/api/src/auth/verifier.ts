/** Who a request belongs to, as the auth provider vouches for it. */
export interface AuthIdentity {
  /** Stable user id at the auth provider (`sub`). */
  readonly authUserId: string;
  readonly email: string | null;
}

/**
 * The API's only view of authentication (ADR-0001). Neon Auth in production and a fake in tests
 * implement it, so no route knows which provider is behind it. `null` means "not authenticated".
 */
export interface TokenVerifier {
  verify(token: string): Promise<AuthIdentity | null>;
}
