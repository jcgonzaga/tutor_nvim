import { describe, expect, it } from "vitest";
import { parseSkill, type Skill } from "@tutor-nvim/exercise-schema";
import { createProfile, createUserSkill, type Profile } from "@tutor-nvim/pedagogy";
import { summarizeProgress } from "./summary";

const NOW = 1_700_000_000_000;
const skill = (slug: string, prerequisites: string[] = []): Skill =>
  parseSkill({
    schemaVersion: 1,
    id: slug.replaceAll(".", "-"),
    slug,
    title: slug,
    description: slug,
    domain: "vim",
    tier: 1,
    difficulty: 1,
    prerequisites,
  });
const skills = [skill("vim.a"), skill("vim.b", ["vim.a"])];

describe("summarizeProgress", () => {
  it("is empty for a new learner, with the first skill open and the rest locked", () => {
    const summary = summarizeProgress(createProfile("u", NOW), skills, NOW);
    expect(summary).toMatchObject({
      skillCount: 2,
      stageCounts: { locked: 1, learning: 1, practicing: 0, fluent: 0, mastered: 0 },
      sessionsCompleted: 0,
      lastSessionDate: null,
      attempts: 0,
      successRate: null,
      reviewsDue: 0,
      nextReviewAt: null,
    });
  });

  it("counts finished sessions, not abandoned ones, and the success rate of attempts", () => {
    const base = createProfile("u", NOW);
    const profile: Profile = {
      ...base,
      sessions: [
        {
          date: "2026-10-20",
          startedAt: 1,
          finishedAt: 2,
          exercises: 3,
          successes: 3,
          reviewsCompleted: 0,
          abandoned: false,
        },
        {
          date: "2026-10-21",
          startedAt: 1,
          finishedAt: 2,
          exercises: 1,
          successes: 0,
          reviewsCompleted: 0,
          abandoned: true,
        },
      ],
      history: [
        { exerciseId: "e1", skillIds: ["vim.a"], at: 1, success: true, performance: 90 },
        { exerciseId: "e1", skillIds: ["vim.a"], at: 2, success: false, performance: 10 },
        { exerciseId: "e2", skillIds: ["vim.a"], at: 3, success: true, performance: 80 },
        { exerciseId: "e2", skillIds: ["vim.a"], at: 4, success: true, performance: 80 },
      ],
    };
    const summary = summarizeProgress(profile, skills, NOW);
    expect(summary.sessionsCompleted).toBe(1);
    expect(summary.lastSessionDate).toBe("2026-10-20");
    expect(summary.attempts).toBe(4);
    expect(summary.successRate).toBe(75);
  });

  it("separates reviews that are due from the next one scheduled ahead", () => {
    const base = createProfile("u", NOW);
    const profile: Profile = {
      ...base,
      learner: {
        skills: {
          "vim.a": { ...createUserSkill("vim.a"), nextReviewAt: NOW - 1000 },
          "vim.b": { ...createUserSkill("vim.b"), nextReviewAt: NOW + 5000 },
        },
      },
    };
    const summary = summarizeProgress(profile, skills, NOW);
    expect(summary.reviewsDue).toBe(1);
    expect(summary.nextReviewAt).toBe(NOW + 5000);
  });
});
