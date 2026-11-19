import { describe, expect, it } from "vitest";

import {
  ExerciseValidationError,
  parseExerciseYaml,
  parseWorkspaceExercise,
  parseWorkspaceExerciseYaml,
} from "./index";
import type { WorkspaceExerciseInput } from "./index";

/**
 * A workspace exercise: the end state of a simulated workspace, written as objectives over that
 * state and solved as action lists, never as one tool's keys (S1, S2, S5).
 */

const yaml = `schemaVersion: 1
kind: workspace
id: workspace-open-file-001
slug: workspace.file.open-and-split-001
title: Open another file beside the first
skillIds: [workspace.file.open]
mode: learn
difficulty: 1
initialState:
  files:
    src/main.ts: 'const mode = "development";'
    src/other.ts: "export const other = 1;"
  path: src/main.ts
  cwd: /project
objective:
  type: all
  goals:
    - { type: active_file, path: src/other.ts }
    - { type: open_buffers, paths: [src/other.ts, src/main.ts] }
    - { type: layout, text: "side(leaf, leaf)" }
    - { type: split_ratio, index: 0, ratio: 0.5 }
    - { type: focus, leaf: 1 }
    - { type: buffer_text, path: src/main.ts, text: 'const mode = "development";' }
    - { type: file_text, path: src/other.ts, text: "export const other = 1;" }
solutions:
  - actions: [file.find, file.open, window.split-side-by-side]
    classification: optimal
  - actions: [file.open, window.split-side-by-side]
    classification: efficient
`;

function validInput(): WorkspaceExerciseInput {
  return {
    schemaVersion: 1,
    kind: "workspace",
    id: "workspace-split-001",
    slug: "workspace.window.split-001",
    title: "Split the window",
    skillIds: ["workspace.window.split"],
    mode: "learn",
    difficulty: 1,
    initialState: { files: { "src/main.ts": "one" }, path: "src/main.ts", cwd: "/project" },
    objective: { type: "layout", text: "side(leaf, leaf)" },
    solutions: [
      { actions: ["window.split-side-by-side"], classification: "optimal" },
      { actions: ["window.split-stacked"], classification: "valid" },
    ],
  };
}

const issuesOf = (input: unknown): string[] => {
  try {
    parseWorkspaceExercise(input);
  } catch (error) {
    if (error instanceof ExerciseValidationError) return [...error.issues];
    throw error;
  }
  return [];
};

describe("workspace exercise schema", () => {
  it("parses YAML into the normalized shape", () => {
    const exercise = parseWorkspaceExerciseYaml(yaml, "split.yaml");
    expect(exercise.kind).toBe("workspace");
    expect(exercise.id).toBe("workspace-open-file-001");
    expect(exercise.instruction).toBe("Open another file beside the first");
    expect(exercise.environment).toEqual({
      type: "simulator",
      profile: "workspace-basic-v1",
      layers: [],
    });
    expect(exercise.initialState).toEqual({
      files: {
        "src/main.ts": 'const mode = "development";',
        "src/other.ts": "export const other = 1;",
      },
      path: "src/main.ts",
      cwd: "/project",
    });
    expect(exercise.objective).toEqual({
      type: "all",
      goals: [
        { type: "active_file", path: "src/other.ts" },
        // Open buffers are a set: the order content writes them in is not the point.
        { type: "open_buffers", paths: ["src/main.ts", "src/other.ts"] },
        { type: "layout", text: "side(leaf, leaf)" },
        { type: "split_ratio", index: 0, ratio: 0.5 },
        { type: "focus", leaf: 1 },
        {
          type: "buffer_text",
          path: "src/main.ts",
          targetLines: ['const mode = "development";'],
        },
        { type: "file_text", path: "src/other.ts", targetLines: ["export const other = 1;"] },
      ],
    });
    expect(exercise.solutions).toEqual([
      {
        actions: [
          { action: "file.find" },
          { action: "file.open" },
          { action: "window.split-side-by-side" },
        ],
        classification: "optimal",
      },
      {
        actions: [{ action: "file.open" }, { action: "window.split-side-by-side" }],
        classification: "efficient",
      },
    ]);
  });

  it("falls back to the title for the instruction and to a workspace profile for the environment", () => {
    const exercise = parseWorkspaceExercise(validInput());
    expect(exercise.instruction).toBe("Split the window");
    expect(exercise.environment.profile).toBe("workspace-basic-v1");
  });

  it("reads an action with a target only where the vocabulary takes one", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      solutions: [
        {
          actions: [{ action: "edit.change", target: "inner-quotes" }],
          classification: "optimal",
        },
      ],
    });
    expect(exercise.solutions[0]?.actions).toEqual([
      { action: "edit.change", target: "inner-quotes" },
    ]);
    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          {
            actions: [{ action: "window.split-side-by-side", target: "inner-quotes" }],
            classification: "optimal",
          },
        ],
      }).join("\n"),
    ).toMatch(/takes no target/);
  });

  it("rejects an action the keymap vocabulary does not have", () => {
    const issues = issuesOf({
      ...validInput(),
      solutions: [{ actions: ["window.split-diagonally"], classification: "optimal" }],
    });
    expect(issues.join("\n")).toMatch(/solutions\.0\.actions\.0/);
  });

  it("requires exactly one solution classified optimal", () => {
    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          { actions: ["window.split-side-by-side"], classification: "optimal" },
          { actions: ["window.split-stacked"], classification: "optimal" },
        ],
      }).join("\n"),
    ).toMatch(/exactly one solution classified optimal/);
    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: ["window.split-stacked"], classification: "valid" }],
      }).join("\n"),
    ).toMatch(/exactly one solution classified optimal/);
  });

  it("rejects an objective the union does not have and a one-goal all", () => {
    expect(
      issuesOf({ ...validInput(), objective: { type: "cursor_at", line: 1, column: 1 } }),
    ).not.toEqual([]);
    expect(
      issuesOf({
        ...validInput(),
        objective: { type: "all", goals: [{ type: "layout", text: "leaf" }] },
      }),
    ).not.toEqual([]);
    expect(issuesOf({ ...validInput(), objective: { type: "focus", leaf: -1 } })).not.toEqual([]);
    expect(
      issuesOf({ ...validInput(), objective: { type: "split_ratio", index: 0, ratio: 2 } }),
    ).not.toEqual([]);
  });

  it("rejects an initial state without a path or with unknown fields", () => {
    expect(issuesOf({ ...validInput(), initialState: { files: {} } })).not.toEqual([]);
    expect(issuesOf({ ...validInput(), surprise: true })).not.toEqual([]);
  });

  it("leaves the vim and shell kinds parsing exactly as before", () => {
    expect(
      parseExerciseYaml(
        `schemaVersion: 1
id: vim-ci-quotes-001
slug: vim.ci-quotes.basic-001
title: Change the mode
skillIds: [vim.operator.change]
mode: learn
difficulty: 1
initialState: { buffer: 'const mode = "development";' }
objective: { type: buffer_equals, target: 'const mode = "production";' }
evaluation: { requireFinalNormalMode: true }
solutions:
  - { sequence: 'ci"production<Esc>', classification: optimal }
hints: [{ afterMs: 5000, level: 1, text: 'Use ci"' }]
`,
      ),
    ).toEqual({
      schemaVersion: 1,
      kind: "vim",
      id: "vim-ci-quotes-001",
      slug: "vim.ci-quotes.basic-001",
      title: "Change the mode",
      skillIds: ["vim.operator.change"],
      mode: "learn",
      difficulty: 1,
      environment: { type: "simulator", profile: "vim-basic-v1", layers: [] },
      actionSolutions: [],
      initialState: {
        lines: ['const mode = "development";'],
        cursor: { line: 0, column: 0 },
        vimMode: "normal",
        setupKeys: [],
      },
      objective: { type: "buffer_equals", targetLines: ['const mode = "production";'] },
      evaluation: { requireFinalNormalMode: true },
      solutions: [
        {
          sequence: 'ci"production<Esc>',
          classification: "optimal",
          keys: ["c", "i", '"', "p", "r", "o", "d", "u", "c", "t", "i", "o", "n", "<Esc>"],
        },
      ],
      antiPatterns: [],
      hints: [{ afterMs: 5000, level: 1, text: 'Use ci"' }],
      metadata: { transferTags: [] },
      instruction: "Change the mode",
    });

    expect(
      parseExerciseYaml(`schemaVersion: 1
kind: shell
id: shell-mkdir-001
slug: shell.mkdir.basic-001
title: Create a folder
skillIds: [linux.shell.files]
mode: recall
difficulty: 1
initialState: { files: { "notes.txt": "hi" } }
objective: { type: cwd_equals, path: "" }
solutions: [{ commands: ["mkdir docs"], classification: optimal }]
`),
    ).toEqual({
      schemaVersion: 1,
      kind: "shell",
      id: "shell-mkdir-001",
      slug: "shell.mkdir.basic-001",
      title: "Create a folder",
      skillIds: ["linux.shell.files"],
      mode: "recall",
      difficulty: 1,
      actionSolutions: [],
      environment: { type: "simulator", profile: "shell-basic-v1", layers: [] },
      initialState: { files: { "notes.txt": "hi" }, modes: {}, cwd: "" },
      objective: { type: "cwd_equals", path: "" },
      solutions: [
        {
          classification: "optimal",
          commands: ["mkdir docs"],
          sequence: "mkdir docs<CR>",
          keys: ["m", "k", "d", "i", "r", "<Space>", "d", "o", "c", "s", "<CR>"],
        },
      ],
      antiPatterns: [],
      hints: [],
      metadata: { transferTags: [] },
      instruction: "Create a folder",
    });
  });

  it("does not load a workspace exercise into the content bundle yet", () => {
    // The content bundle is what the Vim and shell evaluators replay; a workspace solution is a
    // list of actions, replayed by the workspace engine (T4). It is parsed by its own entry point.
    expect(() => parseExerciseYaml(yaml, "split.yaml")).toThrow(
      /kind: workspace exercises cannot be loaded into the content bundle yet/,
    );
  });
});
