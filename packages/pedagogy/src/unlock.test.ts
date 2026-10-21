import { describe, expect, it } from "vitest";
import { createUserSkill } from "./userSkill";
import { availableSkills, isUnlocked, resolveStages } from "./unlock";
import { CONFIG, skillOf } from "./test-util";
import type { LearnerState, UserSkill } from "./types";

const chain = [
  skillOf("vim.a"),
  skillOf("vim.b", ["vim.a"], 2),
  skillOf("vim.c", ["vim.a", "vim.b"], 3),
];

const practicing = (id: string): UserSkill => ({
  ...createUserSkill(id),
  attemptCount: 3,
  accuracy: 80,
});

const learner = (...skills: UserSkill[]): LearnerState => ({
  skills: Object.fromEntries(skills.map((skill) => [skill.skillId, skill])),
});

describe("prerequisite unlock engine (T-404)", () => {
  it("unlocks only the roots for a new learner", () => {
    const stages = resolveStages(chain, learner(), CONFIG);
    expect(stages).toEqual({ "vim.a": "learning", "vim.b": "locked", "vim.c": "locked" });
    expect(availableSkills(chain, stages)).toEqual(["vim.a"]);
  });

  it("unlocks a dependent once its prerequisite reaches the configured stage", () => {
    const stages = resolveStages(chain, learner(practicing("vim.a")), CONFIG);
    expect(stages["vim.a"]).toBe("practicing");
    expect(stages["vim.b"]).toBe("learning");
    expect(stages["vim.c"]).toBe("locked");
  });

  it("needs every prerequisite, not just one", () => {
    const stages = resolveStages(chain, learner(practicing("vim.a"), practicing("vim.b")), CONFIG);
    expect(stages["vim.c"]).toBe("learning");
    expect(isUnlocked(stages, "vim.c")).toBe(true);
  });

  it("uses the configured threshold", () => {
    const strict = { ...CONFIG, unlock: { minPrerequisiteStage: "fluent" as const } };
    expect(resolveStages(chain, learner(practicing("vim.a")), strict)["vim.b"]).toBe("locked");
  });

  it("locks a skill again when its prerequisite falls back", () => {
    const stages = resolveStages(
      chain,
      learner({ ...practicing("vim.a"), accuracy: 10 }, practicing("vim.b")),
      CONFIG,
    );
    expect(stages["vim.a"]).toBe("learning");
    expect(stages["vim.b"]).toBe("locked");
  });

  it("keeps disabled skills out of the graph and ignores them as prerequisites", () => {
    const skills = [{ ...skillOf("vim.off"), enabled: false }, skillOf("vim.after", ["vim.off"])];
    const stages = resolveStages(skills, learner(), CONFIG);
    expect(stages["vim.off"]).toBe("locked");
    expect(stages["vim.after"]).toBe("learning");
  });

  it("leaves members of a prerequisite cycle locked instead of looping", () => {
    const cycle = [skillOf("vim.x", ["vim.y"]), skillOf("vim.y", ["vim.x"])];
    expect(resolveStages(cycle, learner(), CONFIG)).toEqual({
      "vim.x": "locked",
      "vim.y": "locked",
    });
  });
});
