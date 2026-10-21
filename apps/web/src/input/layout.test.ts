import { describe, expect, it } from "vitest";
import { detectLayout } from "./layout";

describe("layout detection", () => {
  it('recognizes US ANSI: " is Shift+Quote', () => {
    expect(detectLayout({ key: '"', code: "Quote" })).toBe("us-ansi");
  });

  it('recognizes ES ISO: " is Shift+Digit2', () => {
    expect(detectLayout({ key: '"', code: "Digit2" })).toBe("es-iso");
  });

  it("is inconclusive for anything else instead of guessing", () => {
    expect(detectLayout({ key: "2", code: "Digit2" })).toBeNull();
    expect(detectLayout({ key: "'", code: "Quote" })).toBeNull();
    expect(detectLayout({ key: '"', code: "KeyQ" })).toBeNull();
  });
});
