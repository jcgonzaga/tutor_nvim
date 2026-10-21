import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    // Some API tests start an in-process Postgres, which takes a few seconds on a busy machine.
    testTimeout: 20_000,
  },
});
