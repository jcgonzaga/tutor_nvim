import { browserStorage } from "../storage/browserStorage";
import type { AuthClient } from "./auth";
import type { CloudConfig } from "./config";
import { createBetterAuthClient } from "./neonAuth";

/** The auth client for a configuration. The fake one is a separate chunk, loaded only for tests. */
export async function loadAuthClient(config: CloudConfig): Promise<AuthClient> {
  // The build-time check lets the bundler drop the stand-in from normal builds altogether.
  if (import.meta.env.VITE_AUTH_MODE === "fake" && config.fakeAuth) {
    const { createFakeAuth } = await import("./fakeAuth");
    return createFakeAuth(browserStorage());
  }
  if (!config.authUrl) throw new Error("VITE_NEON_AUTH_URL is not set");
  return createBetterAuthClient(config.authUrl);
}
