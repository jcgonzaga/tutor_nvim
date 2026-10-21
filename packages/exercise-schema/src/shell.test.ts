import { describe, expect, it } from "vitest";
import {
  ExerciseValidationError,
  parseExercise,
  parseExerciseYaml,
  validateContent,
} from "./index";
import type { ShellExerciseInput } from "./index";

function validInput(): ShellExerciseInput {
  return {
    schemaVersion: 1,
    kind: "shell",
    id: "shell-mkdir-001",
    slug: "shell.mkdir.basic-001",
    title: "Create a folder",
    instruction: "Create a folder called docs",
    skillIds: ["linux.shell.files"],
    mode: "recall",
    difficulty: 1,
    initialState: { files: { "notes.txt": "hi\n" } },
    objective: { type: "fs_matches", dirs: ["docs"] },
    solutions: [{ commands: ["mkdir docs"], classification: "optimal" }],
  };
}

const issuesOf = (input: unknown): string[] => {
  try {
    parseExercise(input);
  } catch (error) {
    if (error instanceof ExerciseValidationError) return [...error.issues];
    throw error;
  }
  return [];
};

describe("shell exercise schema", () => {
  it("parses and normalizes a shell exercise", () => {
    const exercise = parseExercise({
      ...validInput(),
      initialState: {
        files: { "project/run.sh": "echo hi\n", "project/empty/": "" },
        modes: { "project/run.sh": "644" },
        cwd: "project",
      },
      objective: {
        type: "all",
        goals: [
          { type: "fs_matches", modes: { "project/run.sh": "755" } },
          { type: "cwd_equals", path: "project" },
        ],
      },
    });
    if (exercise.kind !== "shell") throw new Error("expected a shell exercise");

    expect(exercise.initialState).toEqual({
      files: { "project/run.sh": "echo hi\n", "project/empty/": "" },
      modes: { "project/run.sh": 0o644 },
      cwd: "project",
    });
    expect(exercise.objective).toEqual({
      type: "all",
      goals: [
        { type: "fs_matches", files: {}, dirs: [], absent: [], modes: { "project/run.sh": 0o755 } },
        { type: "cwd_equals", path: "project" },
      ],
    });
    expect(exercise.environment).toEqual({ type: "simulator", profile: "shell-basic-v1" });
  });

  it("turns each command into the keys that type it, ending with Enter", () => {
    const exercise = parseExercise({
      ...validInput(),
      solutions: [
        { commands: ["mkdir a", "cd a"], classification: "optimal" },
        { commands: ['echo "<x>"'], classification: "valid" },
      ],
    });
    if (exercise.kind !== "shell") throw new Error("expected a shell exercise");
    expect(exercise.solutions[0]?.keys).toEqual([
      ..."mkdir",
      "<Space>",
      "a",
      "<CR>",
      ..."cd",
      "<Space>",
      "a",
      "<CR>",
    ]);
    // `<` is spelled out so it cannot be mistaken for the start of a key name.
    expect(exercise.solutions[1]?.keys).toContain("<lt>");
    expect(exercise.solutions[0]?.sequence).toBe("mkdir a<CR>cd a<CR>");
  });

  it("falls back to the title when there is no instruction", () => {
    const input = validInput();
    delete input.instruction;
    const exercise = parseExercise(input);
    expect(exercise.instruction).toBe("Create a folder");
  });

  it("treats content without a kind as a Vim exercise and rejects unknown kinds", () => {
    expect(issuesOf({ ...validInput(), kind: "emacs" })).toEqual([
      'kind: must be "vim" or "shell", got "emacs"',
    ]);
    expect(issuesOf({ kind: undefined })[0]).not.toMatch(/must be "vim" or "shell"/);
  });

  it.each([
    ["an absolute path", { files: { "/etc/passwd": "x" } }, /relative to the home directory/],
    ["a path that climbs out", { files: { "../x": "x" } }, /cannot contain/],
    [
      "a file that is also a parent",
      { files: { "a.txt": "x", "a.txt/b": "y" } },
      /is a file, so it cannot also contain/,
    ],
    ["a mode for a missing path", { modes: { "ghost.txt": "755" } }, /not listed in `files`/],
    ["a malformed mode", { files: { "a.sh": "" }, modes: { "a.sh": "rwx" } }, /permission/],
  ])("rejects %s in the initial state", (_name, state, message) => {
    const issues = issuesOf({ ...validInput(), initialState: state });
    expect(issues.join("\n")).toMatch(message);
  });

  it("rejects an empty fs_matches goal, a one-goal `all`, and unknown fields", () => {
    expect(issuesOf({ ...validInput(), objective: { type: "fs_matches" } }).join()).toMatch(
      /at least one of files, dirs, absent or modes/,
    );
    expect(
      issuesOf({
        ...validInput(),
        objective: { type: "all", goals: [{ type: "cwd_equals", path: "" }] },
      }).length,
    ).toBeGreaterThan(0);
    expect(issuesOf({ ...validInput(), surprise: true }).length).toBeGreaterThan(0);
  });

  it("requires an optimal solution and lists the problems of every field at once", () => {
    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ commands: ["mkdir docs"], classification: "valid" }],
      }).join(),
    ).toMatch(/optimal/);
    expect(issuesOf({ ...validInput(), skillIds: [], solutions: [] }).length).toBeGreaterThan(1);
  });

  it("lets only shell exercises declare shell anti-patterns", () => {
    expect(issuesOf({ ...validInput(), antiPatterns: ["repeated_x"] }).length).toBeGreaterThan(0);
    expect(issuesOf({ ...validInput(), antiPatterns: ["cd_up_chain"] })).toEqual([]);
  });

  it("parses YAML and shares the id and slug namespace with Vim exercises", () => {
    const yaml = `schemaVersion: 1
kind: shell
id: shell-touch-001
slug: shell.touch.basic-001
title: Create a file
skillIds: [vim.mode.normal]
mode: learn
difficulty: 1
initialState: {}
objective: { type: fs_matches, files: { "a.txt": "" } }
solutions:
  - { commands: ["touch a.txt"], classification: optimal }
`;
    expect(parseExerciseYaml(yaml).kind).toBe("shell");

    const skill = `schemaVersion: 1
id: vim-mode-normal
slug: vim.mode.normal
title: Normal mode
description: x
domain: vim
tier: 1
difficulty: 1
`;
    const dup = yaml.replace("shell-touch-001", "shell-touch-002");
    const { errors } = validateContent({
      skills: [{ path: "s.yaml", text: skill }],
      exercises: [
        { path: "a.yaml", text: yaml },
        { path: "b.yaml", text: dup },
      ],
    });
    expect(errors.join("\n")).toMatch(/duplicate exercise slug "shell.touch.basic-001"/);
  });
});
