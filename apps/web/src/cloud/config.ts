/**
 * Cloud sync is optional. Without `VITE_API_URL` the app is exactly the local product of M5:
 * nothing is requested, nothing is shown. `VITE_NEON_AUTH_URL` points at the Neon Auth (managed
 * Better Auth) instance; `VITE_AUTH_MODE=fake` swaps in a stand-in used only by E2E tests and
 * local development against an API started with `AUTH_MODE=fake`.
 */
export interface CloudConfig {
  readonly apiUrl: string;
  readonly authUrl: string | null;
  readonly fakeAuth: boolean;
}

export function readCloudConfig(
  env: Readonly<Record<string, string | undefined>>,
): CloudConfig | null {
  const apiUrl = env.VITE_API_URL?.replace(/\/$/, "");
  if (!apiUrl) return null;
  const fakeAuth = env.VITE_AUTH_MODE === "fake";
  const authUrl = env.VITE_NEON_AUTH_URL?.replace(/\/$/, "") ?? null;
  if (!fakeAuth && !authUrl) return null;
  return { apiUrl, authUrl, fakeAuth };
}
