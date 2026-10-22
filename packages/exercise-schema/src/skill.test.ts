import { describe, expect, it } from "vitest";
import { ExerciseValidationError, parseSkill, parseSkillYaml, type SkillInput } from "./index";

function validSkill(): SkillInput {
  return {
    schemaVersion: 1,
    id: "vim-textobject-inner-quotes",
    slug: "vim.textobject.inner-quotes",
    title: "Inside quotes",
    description: "Operate on the text inside quotes.",
    domain: "vim",
    tier: 4,
    difficulty: 3,
  };
}

function issuesFor(input: unknown): readonly string[] {
  try {
    parseSkill(input);
  } catch (error) {
    if (error instanceof ExerciseValidationError) return error.issues;
    throw error;
  }
  throw new Error("expected the skill to be rejected");
}

describe("skill schema v1", () => {
  it("parses a minimal skill and applies defaults", () => {
    expect(parseSkill(validSkill())).toEqual({
      ...validSkill(),
      lesson: [],
      prerequisites: [],
      concepts: [],
      tags: [],
      enabled: true,
    });
  });

  it("parses YAML with prerequisites, concepts and tags", () => {
    const skill = parseSkillYaml(
      [
        "schemaVersion: 1",
        "id: vim-textobject-inner-quotes",
        "slug: vim.textobject.inner-quotes",
        "title: Inside quotes",
        "description: Operate on the text inside quotes.",
        "domain: vim",
        "tier: 4",
        "difficulty: 3",
        "prerequisites: [vim.operator.change, vim.mode.normal]",
        "concepts: [operator, modifier, text-object]",
        "tags: [text-object, quotes]",
      ].join("\n"),
    );
    expect(skill.prerequisites).toEqual(["vim.operator.change", "vim.mode.normal"]);
    expect(skill.tags).toEqual(["text-object", "quotes"]);
  });

  it("requires the fields that identify and place the skill", () => {
    const input = validSkill() as Record<string, unknown>;
    delete input.tier;
    delete input.domain;
    expect(issuesFor(input).join("\n")).toMatch(/tier[\s\S]*domain|domain[\s\S]*tier/);
  });

  it("rejects bad identifiers, domains and unknown keys", () => {
    expect(issuesFor({ ...validSkill(), id: "Not Kebab" }).join("\n")).toContain(
      "id: must be kebab-case",
    );
    expect(issuesFor({ ...validSkill(), slug: "nodots" }).join("\n")).toContain("slug:");
    expect(issuesFor({ ...validSkill(), domain: "emacs" }).join("\n")).toContain("domain");
    expect(issuesFor({ ...validSkill(), colour: "red" }).join("\n")).toContain("colour");
    expect(issuesFor({ ...validSkill(), prerequisites: ["bad slug"] }).join("\n")).toContain(
      "prerequisites.0",
    );
  });

  it("requires the schema version", () => {
    const input = validSkill() as Record<string, unknown>;
    delete input.schemaVersion;
    expect(issuesFor(input).join("\n")).toContain("schemaVersion");
  });
});
