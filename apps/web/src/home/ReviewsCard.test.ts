import { describe, expect, it } from "vitest";
import { DAY_MS, createUserSkill, type LearnerState } from "@tutor-nvim/pedagogy";
import { es } from "../i18n/es";
import { reviewBuckets } from "./ReviewsCard";

const NOW = 1_700_000_000_000;
const learner: LearnerState = {
  skills: {
    "vim.a": { ...createUserSkill("vim.a"), nextReviewAt: NOW - 1000 },
    "vim.b": { ...createUserSkill("vim.b"), nextReviewAt: NOW + DAY_MS },
  },
};

describe("reviewBuckets", () => {
  it("labels the groups in English by default and leaves empty ones out", () => {
    expect(reviewBuckets(learner, NOW).map((bucket) => bucket.label)).toEqual([
      "Today",
      "Tomorrow",
    ]);
  });

  it("labels the groups in the chosen language", () => {
    expect(reviewBuckets(learner, NOW, es.home.reviews.buckets).map((b) => b.label)).toEqual([
      "Hoy",
      "Mañana",
    ]);
  });
});
