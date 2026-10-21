import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
});
