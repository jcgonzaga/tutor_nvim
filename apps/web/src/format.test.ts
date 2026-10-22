import { describe, expect, it } from "vitest";
import { describeRecommendation, formatWhen } from "./format";
import { es } from "./i18n/es";

const NOW = 1_000_000_000;
const title = (id: string) => id.toUpperCase();

describe("formatWhen", () => {
  it("reads naturally at each scale", () => {
    expect(formatWhen(NOW - 5, NOW)).toBe("now");
    expect(formatWhen(NOW + 10 * 60_000, NOW)).toBe("in 10 minutes");
    expect(formatWhen(NOW + 60 * 60_000, NOW)).toBe("in 1 hour");
    expect(formatWhen(NOW + 5 * 3_600_000, NOW)).toBe("in 5 hours");
    expect(formatWhen(NOW + 2 * 86_400_000, NOW)).toBe("in 2 days");
  });
});

describe("describeRecommendation", () => {
  it("names due reviews and truncates a long list", () => {
    expect(describeRecommendation({ kind: "review-due", skillIds: ["a"] }, title, NOW)).toBe(
      "1 skill due for review: A.",
    );
    expect(
      describeRecommendation(
        { kind: "review-due", skillIds: ["a", "b", "c", "d", "e"] },
        title,
        NOW,
      ),
    ).toBe("5 skills due for review: A, B, C and 2 more.");
  });

  it("describes the other outcomes", () => {
    expect(describeRecommendation({ kind: "learn", skillId: "x" }, title, NOW)).toBe(
      "Next new skill: X.",
    );
    expect(
      describeRecommendation(
        { kind: "next-review", skillId: "x", at: NOW + 86_400_000 },
        title,
        NOW,
      ),
    ).toBe("Next review: X in 1 day.");
    expect(describeRecommendation({ kind: "all-caught-up" }, title, NOW)).toBe(
      "You are all caught up.",
    );
  });
});

describe("in Spanish", () => {
  it("reads naturally at each scale and pluralizes", () => {
    expect(formatWhen(NOW - 5, NOW, es.common)).toBe("ahora");
    expect(formatWhen(NOW + 60 * 60_000, NOW, es.common)).toBe("en 1 hora");
    expect(formatWhen(NOW + 2 * 86_400_000, NOW, es.common)).toBe("en 2 días");
  });

  it("describes what comes next", () => {
    expect(
      describeRecommendation({ kind: "review-due", skillIds: ["a", "b"] }, title, NOW, es.common),
    ).toBe("2 habilidades por repasar: A, B.");
    expect(describeRecommendation({ kind: "all-caught-up" }, title, NOW, es.common)).toBe(
      "Estás al día.",
    );
  });
});
