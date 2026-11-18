import { describe, expect, it } from "vitest";

import { parseExercise, parseExerciseYaml } from "./validate";

/** An exercise that asks for an action instead of naming one tool's keys (S6). */
const exercise = (actionSolutions: string): string =>
  [
    "schemaVersion: 1",
    "id: vim-split-001",
    "slug: workspace.split.basic-001",
    "title: Split the window",
    "skillIds:",
    "  - vim.window.split",
    "mode: learn",
    "difficulty: 1",
    "initialState:",
    '  buffer: "one"',
    "objective:",
    "  type: buffer_equals",
    '  target: "one"',
    "evaluation: {}",
    "solutions:",
    '  - sequence: "dd"',
    "    classification: optimal",
    actionSolutions,
    "",
  ].join("\n");

const actions = (lines: readonly string[]): string =>
  ["actionSolutions:", ...lines.map((line) => `  ${line}`)].join("\n");

describe("an exercise may ask for an action, not for one tool's keys (S6)", () => {
  it("keeps the field empty when the exercise only declares keys", () => {
    const parsed = parseExerciseYaml(exercise(""), "a.yaml");
    expect(parsed.actionSolutions).toEqual([]);
  });

  it("reads an action solution with its classification", () => {
    const parsed = parseExerciseYaml(
      exercise(actions(["  - action: window.split-side-by-side", "    classification: optimal"])),
      "a.yaml",
    );
    expect(parsed.actionSolutions).toEqual([
      { action: "window.split-side-by-side", classification: "optimal" },
    ]);
  });

  it("rejects an action the keymap vocabulary does not have", () => {
    expect(() =>
      parseExerciseYaml(
        exercise(actions(["  - action: window.split-diagonally", "    classification: optimal"])),
        "a.yaml",
      ),
    ).toThrow(/actionSolutions\.0\.action: Invalid option/);
  });

  it("rejects a target on an action that takes none", () => {
    expect(() =>
      parseExercise(
        {
          schemaVersion: 1,
          id: "vim-split-001",
          slug: "workspace.split.basic-001",
          title: "Split the window",
          skillIds: ["vim.window.split"],
          mode: "learn",
          difficulty: 1,
          initialState: { buffer: "one" },
          objective: { type: "buffer_equals", target: "one" },
          evaluation: {},
          solutions: [{ sequence: "dd", classification: "optimal" }],
          actionSolutions: [
            { action: "window.split-side-by-side", target: "inner-quotes", classification: "optimal" },
          ],
        },
        "a.yaml",
      ),
    ).toThrow(/takes no target/);
  });

  it("rejects the same action declared twice", () => {
    expect(() =>
      parseExerciseYaml(
        exercise(
          actions([
            "  - action: window.split-side-by-side",
            "    classification: optimal",
            "  - action: window.split-side-by-side",
            "    classification: efficient",
          ]),
        ),
        "a.yaml",
      ),
    ).toThrow(/twice/);
  });
});
