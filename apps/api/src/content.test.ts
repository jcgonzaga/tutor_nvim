import { describe, expect, it } from "vitest";
import { readContentInput } from "./content";
import { embeddedContent } from "./content.embedded";

describe("embedded content", () => {
  it("is identical to content/ (run `pnpm content:embed` after editing content)", () => {
    expect(embeddedContent).toEqual(readContentInput());
  });
});
