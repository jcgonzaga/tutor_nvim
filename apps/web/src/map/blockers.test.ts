import { describe, expect, it } from "vitest";
import { es } from "../i18n/es";
import { describeBlocker } from "./blockers";

describe("describeBlocker", () => {
  it("keeps the English text pedagogy reports by default", () => {
    expect(describeBlocker("delayed recalls 0 < 2")).toBe("delayed recalls 0 < 2");
    expect(describeBlocker("mastery 55 < 80")).toBe("mastery 55 < 80");
  });

  it("puts the criterion in the chosen language and keeps the numbers", () => {
    const words = es.map.detail.blockerCriteria;
    expect(describeBlocker("transfer exercises 1 < 2", words)).toBe(
      "ejercicios de transferencia 1 < 2",
    );
    expect(describeBlocker("accuracy 60 < 75", words)).toBe("precisión 60 < 75");
  });

  it("shows a blocker of an unknown shape or criterion as received", () => {
    const words = es.map.detail.blockerCriteria;
    expect(describeBlocker("something else", words)).toBe("something else");
    expect(describeBlocker("speed 1 < 2", words)).toBe("speed 1 < 2");
  });
});
