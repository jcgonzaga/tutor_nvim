import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;

/**
 * Performance budgets (T-902) run against the production build served by `vite preview`, never the
 * dev server: dev builds are unminified and say nothing about what learners get. No API is needed;
 * practice is local-first and the keypress path never touches the network.
 */
export default defineConfig({
  testDir: "tests/perf",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm --filter @tutor-nvim/web exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
