import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ExerciseValidationError,
  parseVimExercise,
  parseExerciseYaml,
  validateExerciseCollection,
  type VimExerciseInput,
} from "./index";

const CANONICAL_PATH = new URL(
  "../../../content/exercises/vim-ci-quotes-001.yaml",
  import.meta.url,
);

function validInput(): VimExerciseInput {
  return {
    schemaVersion: 1,
    id: "vim-ci-quotes-001",
    slug: "vim.ci-quotes.basic-001",
    title: "Change inside quotes",
    skillIds: ["vim.operator.change"],
    mode: "recall",
    difficulty: 2,
    initialState: {
      buffer: 'const mode = "development";\n',
      cursor: { line: 1, column: 18 },
      vimMode: "normal",
    },
    objective: { type: "buffer_equals", target: 'const mode = "production";\n' },
    evaluation: { requireFinalNormalMode: true },
    solutions: [{ sequence: 'ci"production<Esc>', classification: "optimal" }],
  };
}

function issuesFor(input: unknown): readonly string[] {
  try {
    parseVimExercise(input);
  } catch (error) {
    if (error instanceof ExerciseValidationError) return error.issues;
    throw error;
  }
  throw new Error("expected the exercise to be rejected");
}

describe("exercise schema v1", () => {
  it("parses and normalizes the canonical YAML exercise", () => {
    const exercise = parseExerciseYaml(
      readFileSync(CANONICAL_PATH, "utf8"),
      "vim-ci-quotes-001.yaml",
    );
    if (exercise.kind !== "vim") throw new Error("expected a Vim exercise");

    expect(exercise.kind).toBe("vim");
    expect(exercise.id).toBe("vim-ci-quotes-001");
    expect(exercise.slug).toBe("vim.ci-quotes.basic-001");
    expect(exercise.skillIds).toEqual(["vim.operator.change", "vim.textobject.inner-quotes"]);
    expect(exercise.initialState).toEqual({
      lines: ['const mode = "development";'],
      cursor: { line: 0, column: 17 },
      vimMode: "normal",
      setupKeys: [],
    });
    expect(exercise.objective).toEqual({
      type: "buffer_equals",
      targetLines: ['const mode = "production";'],
    });
    expect(exercise.evaluation.requireFinalNormalMode).toBe(true);
    expect(exercise.solutions).toEqual([
      {
        sequence: 'ci"production<Esc>',
        classification: "optimal",
        keys: ["c", "i", '"', "p", "r", "o", "d", "u", "c", "t", "i", "o", "n", "<Esc>"],
      },
    ]);
  });

  it("applies defaults for optional sections", () => {
    const exercise = parseVimExercise(validInput());
    expect(exercise.environment).toEqual({ type: "simulator", profile: "vim-basic-v1" });
    expect(exercise.antiPatterns).toEqual([]);
    expect(exercise.hints).toEqual([]);
    expect(exercise.metadata).toEqual({ transferTags: [] });
    expect(exercise.instruction).toBe("Change inside quotes");
  });

  it("reports the path of every problem", () => {
    const input = validInput() as Record<string, unknown>;
    delete input.objective;
    input.difficulty = 9;
    input.id = "Not Kebab";

    const issues = issuesFor(input);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("objective:"),
        expect.stringContaining("difficulty:"),
        expect.stringContaining("id: must be kebab-case"),
      ]),
    );
  });

  it("rejects unknown keys so typos in content do not pass silently", () => {
    const issues = issuesFor({ ...validInput(), evalutaion: {} });
    expect(issues.join("\n")).toContain("evalutaion");
  });

  it("requires the schema version", () => {
    const input = validInput() as Record<string, unknown>;
    delete input.schemaVersion;
    expect(issuesFor(input).join("\n")).toContain("schemaVersion");
    expect(issuesFor({ ...input, schemaVersion: 2 }).join("\n")).toContain("schemaVersion");
  });

  it("rejects solutions with invalid key notation", () => {
    const issues = issuesFor({
      ...validInput(),
      solutions: [{ sequence: "ci<Nope>", classification: "optimal" }],
    });
    expect(issues).toEqual(["solutions.0.sequence: Unknown key notation <Nope>"]);
  });

  it("requires at least one solution and rejects `failed` as a declared classification", () => {
    expect(issuesFor({ ...validInput(), solutions: [] }).join("\n")).toContain("solutions");
    expect(
      issuesFor({ ...validInput(), solutions: [{ sequence: "x", classification: "failed" }] }).join(
        "\n",
      ),
    ).toContain("solutions.0.classification");
  });

  it("rejects cursors outside the buffer", () => {
    const base = validInput();
    expect(
      issuesFor({
        ...base,
        initialState: { ...base.initialState, cursor: { line: 2, column: 1 } },
      }),
    ).toEqual(["initialState.cursor.line: line 2 is outside the buffer (1 lines)"]);
    expect(
      issuesFor({
        ...base,
        initialState: { ...base.initialState, cursor: { line: 1, column: 99 } },
      }),
    ).toEqual(["initialState.cursor.column: column 99 is outside line 1 (max 27 in normal mode)"]);
  });

  it("rejects 0-based cursors (content is 1-based)", () => {
    const base = validInput();
    const issues = issuesFor({
      ...base,
      initialState: { ...base.initialState, cursor: { line: 0, column: 0 } },
    });
    expect(issues.join("\n")).toContain("initialState.cursor.line");
  });

  it("reports YAML syntax errors as validation errors", () => {
    expect(() => parseExerciseYaml("id: [unterminated", "bad.yaml")).toThrow(
      ExerciseValidationError,
    );
    expect(() => parseExerciseYaml("id: [unterminated", "bad.yaml")).toThrow("bad.yaml");
  });
});

describe("exercise schema: objectives, hints, metadata", () => {
  it("normalizes cursor_at, mode_equals and compound objectives", () => {
    const exercise = parseVimExercise({
      ...validInput(),
      objective: {
        type: "all",
        goals: [
          { type: "cursor_at", line: 1, column: 3 },
          { type: "mode_equals", mode: "normal" },
        ],
      },
    });
    expect(exercise.objective).toEqual({
      type: "all",
      goals: [
        { type: "cursor_at", position: { line: 0, column: 2 } },
        { type: "mode_equals", mode: "normal" },
      ],
    });
  });

  it("requires at least two goals in a compound objective, and rejects unknown goal types", () => {
    expect(
      issuesFor({
        ...validInput(),
        objective: { type: "all", goals: [{ type: "mode_equals", mode: "normal" }] },
      }).join("\n"),
    ).toContain("objective");
    expect(issuesFor({ ...validInput(), objective: { type: "teleport" } }).join("\n")).toContain(
      "objective",
    );
  });

  it("rejects 0-based positions in cursor_at, like the initial cursor", () => {
    expect(
      issuesFor({ ...validInput(), objective: { type: "cursor_at", line: 0, column: 0 } }).join(
        "\n",
      ),
    ).toContain("objective");
  });

  it("requires hint levels to count up from 1 and delays that do not go backwards", () => {
    const hints = [
      { afterMs: 4000, level: 2, text: "a" },
      { afterMs: 1000, level: 2, text: "b" },
    ];
    const issues = issuesFor({ ...validInput(), hints });
    expect(issues).toEqual([
      "hints.0.level: hint levels must be 1, 2, 3... in order (expected 1)",
      "hints.1.afterMs: a hint cannot become available before the previous one",
    ]);
    expect(() =>
      parseVimExercise({
        ...validInput(),
        hints: [
          { afterMs: 4000, level: 1, text: "ok" },
          { afterMs: 4000, level: 2, text: "ok" },
        ],
      }),
    ).not.toThrow();
  });

  it("requires a solution classified optimal", () => {
    const issues = issuesFor({
      ...validInput(),
      solutions: [{ sequence: 'ci"production<Esc>', classification: "valid" }],
    });
    expect(issues).toEqual([
      "solutions: declare at least one solution classified optimal (it is the efficiency baseline)",
    ]);
  });

  it("accepts setup keys, normalizing them to canonical tokens, and rejects invalid ones", () => {
    const base = validInput();
    const exercise = parseVimExercise({
      ...base,
      initialState: { ...base.initialState, setupKeys: "dw<Esc>" },
    });
    expect(exercise.initialState.setupKeys).toEqual(["d", "w", "<Esc>"]);
    expect(
      issuesFor({ ...base, initialState: { ...base.initialState, setupKeys: "<Nope>" } }),
    ).toEqual(["initialState.setupKeys: Unknown key notation <Nope>"]);
  });

  it("accepts context and transfer tags, and rejects malformed tags", () => {
    const exercise = parseVimExercise({
      ...validInput(),
      metadata: {
        language: "python",
        context: "config-file",
        estimatedSeconds: 8,
        transferTags: ["context:python"],
      },
    });
    expect(exercise.metadata.transferTags).toEqual(["context:python"]);
    expect(
      issuesFor({ ...validInput(), metadata: { transferTags: ["Not A Tag"] } }).join("\n"),
    ).toContain("metadata.transferTags.0");
  });
});

describe("validateExerciseCollection", () => {
  const a = parseVimExercise(validInput());

  it("passes unique exercises", () => {
    const b = parseVimExercise({
      ...validInput(),
      id: "vim-ci-quotes-002",
      slug: "vim.ci-quotes.basic-002",
    });
    expect(
      validateExerciseCollection([
        { exercise: a, source: "a.yaml" },
        { exercise: b, source: "b.yaml" },
      ]),
    ).toEqual([]);
  });

  it("detects duplicate ids and slugs", () => {
    const errors = validateExerciseCollection([
      { exercise: a, source: "a.yaml" },
      { exercise: a, source: "copy.yaml" },
    ]);
    expect(errors).toEqual([
      'duplicate id "vim-ci-quotes-001" in copy.yaml (first defined in a.yaml)',
      'duplicate slug "vim.ci-quotes.basic-001" in copy.yaml (first defined in a.yaml)',
    ]);
  });
});
