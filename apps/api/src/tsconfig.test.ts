import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")) as {
    compilerOptions: Record<string, unknown>;
  };

describe("apps/api/tsconfig.json", () => {
  // Vercel type-checks the API with its own TypeScript run that ignores `extends`; without
  // `strict` the build fails on code that is correct. So the options are repeated here, and this
  // test keeps them from drifting away from the repository base.
  it("repeats every compiler option of tsconfig.base.json", () => {
    const base = read("../../../tsconfig.base.json").compilerOptions;
    const api = read("../tsconfig.json").compilerOptions;
    expect(api).toMatchObject(base);
  });
});
