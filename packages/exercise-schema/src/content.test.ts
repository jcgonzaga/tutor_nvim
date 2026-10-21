import { describe, expect, it } from "vitest";
import { ContentValidationError, loadContent, validateContent, type ContentSource } from "./index";

function skill(slug: string, extra: Record<string, unknown> = {}): ContentSource {
  const lines = [
    "schemaVersion: 1",
    `id: ${slug.replaceAll(".", "-")}`,
    `slug: ${slug}`,
    `title: ${slug}`,
    "description: A skill.",
    "domain: vim",
    "tier: 1",
    "difficulty: 1",
    ...Object.entries(extra).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
  ];
  return { path: `skills/${slug}.yaml`, text: lines.join("\n") };
}

function exercise(id: string, skillIds: string[], slug = `vim.test.${id}`): ContentSource {
  return {
    path: `exercises/${id}.yaml`,
    text: [
      "schemaVersion: 1",
      `id: ${id}`,
      `slug: ${slug}`,
      "title: An exercise",
      "skillIds:",
      ...skillIds.map((skillId) => `  - ${skillId}`),
      "mode: recall",
      "difficulty: 1",
      "initialState:",
      "  buffer: |",
      "    abc",
      "objective:",
      "  type: buffer_equals",
      "  target: |",
      "    bc",
      "evaluation:",
      "  requireFinalNormalMode: false",
      "solutions:",
      "  - sequence: x",
      "    classification: optimal",
    ].join("\n"),
  };
}

const errorsOf = (skills: ContentSource[], exercises: ContentSource[]) =>
  validateContent({ skills, exercises }).errors;

describe("content loading", () => {
  it("loads valid content", () => {
    const bundle = loadContent({
      skills: [skill("vim.a"), skill("vim.b", { prerequisites: ["vim.a"] })],
      exercises: [exercise("ex-one", ["vim.a"]), exercise("ex-two", ["vim.a", "vim.b"])],
    });
    expect(bundle.skills.map((s) => s.slug)).toEqual(["vim.a", "vim.b"]);
    expect(bundle.exercises.map((e) => e.id)).toEqual(["ex-one", "ex-two"]);
  });

  it("reports an exercise that references a skill that does not exist", () => {
    expect(errorsOf([skill("vim.a")], [exercise("ex-one", ["vim.a", "vim.missing"])])).toEqual([
      'exercises/ex-one.yaml: exercise vim.test.ex-one references unknown skill "vim.missing"',
    ]);
  });

  it("reports an exercise that references a disabled skill", () => {
    expect(errorsOf([skill("vim.a", { enabled: false })], [exercise("ex-one", ["vim.a"])])).toEqual(
      ['exercises/ex-one.yaml: exercise vim.test.ex-one references disabled skill "vim.a"'],
    );
  });

  it("reports unknown and self prerequisites", () => {
    const errors = errorsOf(
      [
        skill("vim.a", { prerequisites: ["vim.nope"] }),
        skill("vim.b", { prerequisites: ["vim.b"] }),
      ],
      [],
    );
    expect(errors).toEqual([
      'skills/vim.a.yaml: skill vim.a has unknown prerequisite "vim.nope"',
      "skills/vim.b.yaml: skill vim.b lists itself as a prerequisite",
    ]);
  });

  it("reports prerequisite cycles with the path", () => {
    const errors = errorsOf(
      [
        skill("vim.a", { prerequisites: ["vim.c"] }),
        skill("vim.b", { prerequisites: ["vim.a"] }),
        skill("vim.c", { prerequisites: ["vim.b"] }),
      ],
      [],
    );
    expect(errors).toEqual(["prerequisite cycle: vim.a -> vim.c -> vim.b -> vim.a"]);
  });

  it("accepts a diamond of prerequisites: shared ancestors are not cycles", () => {
    expect(
      errorsOf(
        [
          skill("vim.a"),
          skill("vim.b", { prerequisites: ["vim.a"] }),
          skill("vim.c", { prerequisites: ["vim.a"] }),
          skill("vim.d", { prerequisites: ["vim.b", "vim.c"] }),
        ],
        [],
      ),
    ).toEqual([]);
  });

  it("reports duplicate ids and slugs, per kind", () => {
    const errors = errorsOf(
      [skill("vim.a"), { ...skill("vim.a"), path: "skills/copy.yaml" }],
      [
        exercise("ex-one", ["vim.a"]),
        { ...exercise("ex-one", ["vim.a"]), path: "exercises/copy.yaml" },
      ],
    );
    expect(errors).toEqual([
      'duplicate skill id "vim-a" in skills/copy.yaml (first defined in skills/vim.a.yaml)',
      'duplicate skill slug "vim.a" in skills/copy.yaml (first defined in skills/vim.a.yaml)',
      'duplicate exercise id "ex-one" in exercises/copy.yaml (first defined in exercises/ex-one.yaml)',
      'duplicate exercise slug "vim.test.ex-one" in exercises/copy.yaml (first defined in exercises/ex-one.yaml)',
    ]);
  });

  it("reports schema errors with the file they came from, along with cross-reference errors", () => {
    const broken: ContentSource = { path: "exercises/broken.yaml", text: "id: [unterminated" };
    const errors = errorsOf([skill("vim.a")], [broken, exercise("ex-one", ["vim.missing"])]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("exercises/broken.yaml");
    expect(errors[1]).toContain('unknown skill "vim.missing"');
  });

  it("loadContent throws one error listing every problem", () => {
    try {
      loadContent({
        skills: [],
        exercises: [exercise("ex-one", ["vim.a"]), exercise("ex-two", ["vim.b"])],
      });
      throw new Error("expected loadContent to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).errors).toHaveLength(2);
      expect((error as Error).message).toContain("Invalid content (2 problems)");
    }
  });
});
