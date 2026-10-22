# ADR-0001 — Authentication: Neon Auth (managed Better Auth)

Status: accepted (M6, T-602). Decided by the project owner.

## Context

M6 needs authenticated, cross-device progress. The plan allows Clerk or Supabase Auth; the
database is Neon (PRD 44), and Neon ships authentication of its own: **Neon Auth**, a managed
[Better Auth](https://better-auth.com) instance that lives next to the database.

## Decision

Use Neon Auth. One vendor for database and identity, no second account to manage.

- **Browser** signs in with email and password against the instance's Better Auth HTTP API
  (`POST /sign-in/email`, `/sign-up/email`, `GET /get-session`) using the session cookie, and asks
  for a short-lived JWT with `GET /token` (the `set-auth-jwt` header of `get-session` is the
  fallback). It does this with `fetch`, **not** the `@neondatabase/auth` SDK, which is in beta,
  targets Next.js (peer dependency `next >= 16`) and drags in Supabase's auth client; AGENTS 23
  asks whether a dependency is needed, and four calls are not.
- **API** verifies the JWT as an `Authorization: Bearer` token: EdDSA signature against the
  instance's JWKS (`<NEON_AUTH_BASE_URL>/.well-known/jwks.json`) and the issuer (the origin of the
  base URL), with `jose`. The user is identified by `sub`; the `users` row is created on the first
  authenticated request.
- Both sides sit behind an interface (`TokenVerifier` in the API, `AuthClient` in the web app), so
  no route or screen knows the provider. Tests use a fake verifier plus one test that signs real
  EdDSA tokens and serves a real JWKS; the web app has a stand-in used only by E2E (`VITE_AUTH_MODE=fake`),
  which the API refuses to enable in production (`AUTH_MODE=fake` + `NODE_ENV=production` fails
  at start-up) and which is not in the production bundle.
- Signing in is **optional**. Practice never requires an account.

## Consequences

- Verified against a live Neon project on 2026-10-22: sign-up from the deployed web app, a JWT
  from `GET /token`, accepted by the API (EdDSA, issuer = origin of `NEON_AUTH_BASE_URL`), and the
  `users` row created on the first authenticated request. The web origin must be listed in the
  Auth instance's trusted domains. Open: the session cookie is third-party when the web app and
  Neon Auth are on different sites (Safari, blocked third-party cookies); see
  [deployment.md](../../deployment.md), "Known limits".
- Email verification, password reset and social login are left to Neon's configuration; the app has
  no UI for them yet.
- Replacing the provider means writing one `TokenVerifier` and one `AuthClient`.
