import { AuthError, type AuthClient, type AuthUser } from "./auth";

type Fetch = typeof fetch;

interface SessionBody {
  readonly user?: { readonly id?: unknown; readonly email?: unknown };
}

function toUser(body: SessionBody | null | undefined): AuthUser | null {
  const user = body?.user;
  if (user && typeof user.id === "string" && typeof user.email === "string") {
    return { id: user.id, email: user.email };
  }
  return null;
}

/**
 * Talks to a Neon Auth instance (managed Better Auth) over its documented HTTP API, with the
 * session cookie. This avoids the beta `@neondatabase/auth` SDK, which targets Next.js and pulls
 * in Supabase's auth client; the four calls the app needs are plain `fetch`.
 *
 * The JWT comes from `GET /token` (Better Auth's JWT plugin); `GET /get-session` also returns it in
 * the `set-auth-jwt` header, used as a fallback.
 */
export function createBetterAuthClient(baseUrl: string, fetchImpl: Fetch = fetch): AuthClient {
  const base = baseUrl.replace(/\/$/, "");
  const call = (path: string, init: RequestInit = {}) =>
    fetchImpl(`${base}${path}`, {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...init.headers },
    });

  async function authenticate(path: string, body: Record<string, string>): Promise<AuthUser> {
    const response = await call(path, { method: "POST", body: JSON.stringify(body) });
    const json = (await response.json().catch(() => null)) as
      (SessionBody & { message?: unknown }) | null;
    if (!response.ok) {
      throw typeof json?.message === "string"
        ? new AuthError(json.message)
        : new AuthError("Could not sign in", "signInFailed");
    }
    const user = toUser(json) ?? (await currentUser());
    if (!user) throw new AuthError("Signed in, but no session was returned", "noSession");
    return user;
  }

  async function currentUser(): Promise<AuthUser | null> {
    const response = await call("/get-session");
    if (!response.ok) return null;
    return toUser((await response.json().catch(() => null)) as SessionBody | null);
  }

  return {
    currentUser,
    signIn: (email, password) => authenticate("/sign-in/email", { email, password }),
    signUp: (email, password, name) => authenticate("/sign-up/email", { email, password, name }),
    async signOut() {
      await call("/sign-out", { method: "POST", body: "{}" });
    },
    async token() {
      const response = await call("/token");
      if (response.ok) {
        const json = (await response.json().catch(() => null)) as { token?: unknown } | null;
        if (typeof json?.token === "string") return json.token;
      }
      const session = await call("/get-session");
      return session.ok ? session.headers.get("set-auth-jwt") : null;
    },
  };
}
