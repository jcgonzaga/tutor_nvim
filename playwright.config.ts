import { defineConfig, devices } from "@playwright/test";
import { seededStorage } from "./tests/e2e/seed";

const PORT = 4173;
const API_PORT = 8788;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    storageState: seededStorage(`http://localhost:${PORT}`),
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // The web app, with cloud sync pointed at the API below and the stand-in auth.
      command: `pnpm --filter @tutor-nvim/web exec vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        VITE_API_URL: `http://localhost:${API_PORT}`,
        VITE_AUTH_MODE: "fake",
        // A stub endpoint: the privacy tests intercept it, no other test ever sends there.
        VITE_ANALYTICS_URL: "https://analytics.test/collect",
        VITE_BUILD_ID: "e2e",
      },
    },
    {
      // The real API on an in-process Postgres, accepting `test:<email>` tokens.
      command: `pnpm --filter @tutor-nvim/api exec tsx src/server.ts`,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        AUTH_MODE: "fake",
        CORS_ORIGIN: `http://localhost:${PORT}`,
        RATE_LIMIT_MAX: "100000",
      },
    },
  ],
});
