import { describe, expect, it } from "vitest";

import {
  ExerciseValidationError,
  isWorkspaceExercise,
  parseExerciseYaml,
  parseWorkspaceExercise,
  parseWorkspaceExerciseYaml,
  validateContent,
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
      // No terminal leaf is declared here, and `null` says so instead of leaving the field absent:
      // the state always carries the answer to "may this exercise open a terminal?" (T7a1).
      terminal: null,
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

  it("reads a path only where the vocabulary names a file inside the simulated project", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      solutions: [
        {
          actions: [
            { action: "file.open", path: "src/other.ts" },
            { action: "file.new", path: "src/notes.md" },
            // The buffer list picks an open buffer by its path (L11), so it names one too.
            { action: "buffer.list", path: "src/other.ts" },
            { action: "window.split-side-by-side" },
          ],
          classification: "optimal",
        },
      ],
    });
    expect(exercise.solutions[0]?.actions).toEqual([
      { action: "file.open", path: "src/other.ts" },
      { action: "file.new", path: "src/notes.md" },
      { action: "buffer.list", path: "src/other.ts" },
      { action: "window.split-side-by-side" },
    ]);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          {
            actions: [{ action: "window.split-side-by-side", path: "src/other.ts" }],
            classification: "optimal",
          },
        ],
      }).join("\n"),
    ).toMatch(
      /"window\.split-side-by-side" takes no path: only file\.open, file\.new, buffer\.list name a path inside the simulated project/,
    );

    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          {
            actions: [{ action: "file.open", path: "/project/src/other.ts" }],
            classification: "optimal",
          },
        ],
      }).join("\n"),
    ).toMatch(
      /solutions\.0\.actions\.0\.path: must name a file inside the simulated project: it is relative, so it cannot start with "\/"/,
    );

    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: [{ action: "file.new", path: "" }], classification: "optimal" }],
      }).join("\n"),
    ).toMatch(/must name a file inside the simulated project, so it cannot be empty/);
  });

  it("reads a text only with edit.insert, which cannot be declared without one", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      objective: { type: "file_text", path: "src/main.ts", text: "two" },
      solutions: [
        {
          actions: [{ action: "edit.insert", text: "two" }, { action: "file.save" }],
          classification: "optimal",
        },
      ],
    });
    expect(exercise.solutions[0]?.actions).toEqual([
      { action: "edit.insert", text: "two" },
      { action: "file.save" },
    ]);

    // Required: an insert that types nothing is not a step a learner can take.
    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: [{ action: "edit.insert" }], classification: "optimal" }],
      }).join("\n"),
    ).toMatch(/"edit\.insert" needs a text: it types the text the solution names/);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          {
            actions: [{ action: "window.split-side-by-side", text: "two" }],
            classification: "optimal",
          },
        ],
      }).join("\n"),
    ).toMatch(/"window\.split-side-by-side" takes no text: only edit\.insert types text/);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: [{ action: "edit.insert", text: "" }], classification: "optimal" }],
      }).join("\n"),
    ).toMatch(/solutions\.0\.actions\.0\.text: must be the text to type, so it cannot be empty/);
  });

  it("reads a query only with the project pickers, which cannot be declared without one", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      solutions: [
        {
          actions: [
            { action: "file.find", query: "util" },
            { action: "grep.project", query: "port" },
            { action: "file.open", path: "src/other.ts" },
          ],
          classification: "optimal",
        },
      ],
    });
    expect(exercise.solutions[0]?.actions).toEqual([
      { action: "file.find", query: "util" },
      { action: "grep.project", query: "port" },
      { action: "file.open", path: "src/other.ts" },
    ]);

    // Required: a picker that narrows by nothing is not a step a learner can take.
    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: [{ action: "file.find" }], classification: "optimal" }],
      }).join("\n"),
    ).toMatch(/"file\.find" needs a query: it names the text the picker searches for/);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          {
            actions: [{ action: "file.open", path: "src/other.ts", query: "util" }],
            classification: "optimal",
          },
        ],
      }).join("\n"),
    ).toMatch(/"file\.open" takes no query: only file\.find, grep\.project search the project/);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: [{ action: "file.find", query: "" }], classification: "optimal" }],
      }).join("\n"),
    ).toMatch(/must be the query to search for, so it cannot be empty/);
  });

  it("records a grep_matches objective with its rows, in the order they were written", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      objective: {
        type: "grep_matches",
        matches: [
          { path: "src/config.ts", line: 1, text: "export const config = { port: 3000 };" },
          { path: "src/server.ts", line: 3, text: "export const server = { port: 3000 };" },
        ],
      },
    });
    expect(exercise.objective).toEqual({
      type: "grep_matches",
      matches: [
        { path: "src/config.ts", line: 1, text: "export const config = { port: 3000 };" },
        { path: "src/server.ts", line: 3, text: "export const server = { port: 3000 };" },
      ],
    });

    // A search with no row, and a line number no file has, are not objectives.
    expect(
      issuesOf({ ...validInput(), objective: { type: "grep_matches", matches: [] } }),
    ).not.toEqual([]);
    expect(
      issuesOf({
        ...validInput(),
        objective: { type: "grep_matches", matches: [{ path: "src/a.ts", line: 0, text: "x" }] },
      }),
    ).not.toEqual([]);
  });

  it("records a zoom objective, with the window it names or none", () => {
    expect(
      parseWorkspaceExercise({ ...validInput(), objective: { type: "zoom", path: "src/main.ts" } })
        .objective,
    ).toEqual({ type: "zoom", path: "src/main.ts" });
    // `null` is how a story says nothing is zoomed, which is a state a restored zoom reaches.
    expect(
      parseWorkspaceExercise({ ...validInput(), objective: { type: "zoom", path: null } })
        .objective,
    ).toEqual({ type: "zoom", path: null });

    // A zoom names a path or the absence of one: an omitted path is not an objective.
    expect(issuesOf({ ...validInput(), objective: { type: "zoom" } })).not.toEqual([]);
    expect(issuesOf({ ...validInput(), objective: { type: "zoom", path: "" } })).not.toEqual([]);
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

  it("loads a workspace exercise through the content bundle entry point, like every other kind", () => {
    // T4 makes the kind loadable: the evaluation package replays its action solutions, so content
    // may hold it. Before that, `parseExercise` rejected it on purpose.
    const exercise = parseExerciseYaml(yaml, "split.yaml");
    if (!isWorkspaceExercise(exercise)) throw new Error("the workspace kind did not load");
    expect(exercise.kind).toBe("workspace");
    expect(exercise.solutions[0]?.actions.map((action) => action.action)).toEqual([
      "file.find",
      "file.open",
      "window.split-side-by-side",
    ]);
  });

  it("holds a workspace exercise in a content bundle beside the other kinds", () => {
    const { bundle, errors } = validateContent({
      skills: [
        {
          path: "skills/workspace.file.open.yaml",
          text: `schemaVersion: 1
id: workspace-file-open
slug: workspace.file.open
title: Open a file
description: Choose a file and work on it.
domain: neovim
tier: 1
difficulty: 1
`,
        },
      ],
      exercises: [{ path: "exercises/workspace-split.yaml", text: yaml }],
    });

    expect(errors).toEqual([]);
    expect(bundle?.exercises.map((exercise) => exercise.kind)).toEqual(["workspace"]);
  });

  it("reports an unknown kind as an unknown kind, workspace included in the message", () => {
    expect(() => parseExerciseYaml(`${yaml.replace("kind: workspace", "kind: terminal")}`)).toThrow(
      /kind: must be "vim", "shell" or "workspace"/,
    );
  });
});

describe("the windows objective", () => {
  it("records the paths the leaves show, in the order they were written", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      objective: { type: "windows", paths: ["src/a.ts", "src/b.ts"] },
    });
    // Order is the point: a swap leaves the same two files in the other order.
    expect(exercise.objective).toEqual({ type: "windows", paths: ["src/a.ts", "src/b.ts"] });
  });

  it("rejects a windows objective that names no window", () => {
    expect(issuesOf({ ...validInput(), objective: { type: "windows", paths: [] } })).not.toEqual(
      [],
    );
  });
});

/**
 * A terminal is a window that shows a session, not a file (T7a1, S6). The exercise declares what the
 * simulated machine prints and nothing else: there is no process to ask, so a command's output is
 * content, and `shell.run` can only append what a file declared.
 */
describe("the terminal an exercise declares", () => {
  it("reads its title, cwd and declared outputs, and null when it declares none", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      initialState: {
        ...validInput().initialState,
        terminal: { title: "dev", cwd: "/project", commands: { "npm test": ["Tests: 3 passed"] } },
      },
    });
    expect(exercise.initialState.terminal).toEqual({
      title: "dev",
      cwd: "/project",
      commands: { "npm test": ["Tests: 3 passed"] },
    });

    // No declaration is a fact the state carries, not a field the caller has to know is missing.
    expect(parseWorkspaceExercise(validInput()).initialState.terminal).toBeNull();

    // The cwd is optional: an undeclared one opens the terminal where the workspace is.
    expect(
      parseWorkspaceExercise({
        ...validInput(),
        initialState: {
          ...validInput().initialState,
          terminal: { title: "dev", commands: { ls: ["src"] } },
        },
      }).initialState.terminal,
    ).toEqual({ title: "dev", cwd: null, commands: { ls: ["src"] } });
  });

  it("refuses a declaration with no title or with fields the engine does not read", () => {
    expect(
      issuesOf({
        ...validInput(),
        initialState: {
          ...validInput().initialState,
          terminal: { title: "", commands: {} },
        },
      }),
    ).not.toEqual([]);
    expect(
      issuesOf({
        ...validInput(),
        initialState: {
          ...validInput().initialState,
          terminal: { title: "dev", commands: {}, shell: "bash" },
        },
      }),
    ).not.toEqual([]);
  });

  it("reads a command only with shell.run, which cannot be declared without one", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      solutions: [
        {
          actions: [{ action: "shell.run", command: "npm test" }, { action: "window.zoom" }],
          classification: "optimal",
        },
      ],
    });
    expect(exercise.solutions[0]?.actions).toEqual([
      { action: "shell.run", command: "npm test" },
      { action: "window.zoom" },
    ]);

    // Required: a shell.run that names no command runs nothing a story can assert.
    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: [{ action: "shell.run" }], classification: "optimal" }],
      }).join("\n"),
    ).toMatch(/"shell\.run" needs a command: it names the command to run/);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          {
            actions: [{ action: "file.open", path: "src/other.ts", command: "npm test" }],
            classification: "optimal",
          },
        ],
      }).join("\n"),
    ).toMatch(/"file\.open" takes no command: only shell\.run runs a command/);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: [{ action: "shell.run", command: "" }], classification: "optimal" }],
      }).join("\n"),
    ).toMatch(/must be the command to run, so it cannot be empty/);
  });

  it("records a session objective and a mode objective", () => {
    expect(
      parseWorkspaceExercise({ ...validInput(), objective: { type: "session", state: "detached" } })
        .objective,
    ).toEqual({ type: "session", state: "detached" });
    expect(
      parseWorkspaceExercise({ ...validInput(), objective: { type: "session", state: "attached" } })
        .objective,
    ).toEqual({ type: "session", state: "attached" });
    expect(
      parseWorkspaceExercise({ ...validInput(), objective: { type: "mode", mode: "resize" } })
        .objective,
    ).toEqual({ type: "mode", mode: "resize" });

    // The story names one of the two states, never nothing and never a third one.
    expect(issuesOf({ ...validInput(), objective: { type: "session" } })).not.toEqual([]);
    expect(
      issuesOf({ ...validInput(), objective: { type: "session", state: "open" } }),
    ).not.toEqual([]);
    expect(issuesOf({ ...validInput(), objective: { type: "mode" } })).not.toEqual([]);
    expect(issuesOf({ ...validInput(), objective: { type: "mode", mode: "insert" } })).not.toEqual(
      [],
    );
  });

  it("reads a tab only with workspace.move, which cannot be declared without one", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      solutions: [
        {
          actions: [{ action: "workspace.move", tab: "tab:2" }, "window.zoom"],
          classification: "optimal",
        },
      ],
    });
    // Carried to the engine, so the replay moves the window into the tab the story names.
    expect(exercise.solutions[0]?.actions).toEqual([
      { action: "workspace.move", tab: "tab:2" },
      { action: "window.zoom" },
    ]);

    // Required: a move that names no tab moves nothing a story can assert.
    expect(
      issuesOf({
        ...validInput(),
        solutions: [{ actions: [{ action: "workspace.move" }], classification: "optimal" }],
      }).join("\n"),
    ).toMatch(/"workspace\.move" needs a tab: it names the workspace the window moves into/);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          {
            actions: [{ action: "file.open", path: "src/main.ts", tab: "tab:2" }],
            classification: "optimal",
          },
        ],
      }).join("\n"),
    ).toMatch(/"file\.open" takes no tab: only workspace\.move names a tab/);

    expect(
      issuesOf({
        ...validInput(),
        solutions: [
          { actions: [{ action: "workspace.move", tab: "" }], classification: "optimal" },
        ],
      }).join("\n"),
    ).toMatch(/must be the tab to move the window into, so it cannot be empty/);
  });

  it("records a terminal_output objective, splitting its text into lines", () => {
    const exercise = parseWorkspaceExercise({
      ...validInput(),
      objective: { type: "terminal_output", lines: ["PASS", "Tests: 3 passed"] },
    });
    expect(exercise.objective).toEqual({
      type: "terminal_output",
      targetLines: ["PASS", "Tests: 3 passed"],
    });

    // Normalized where the boundary is, like `buffer_text`: multi-line content compares as lines.
    expect(
      parseWorkspaceExercise({
        ...validInput(),
        objective: { type: "terminal_output", lines: ["PASS\nTests: 3 passed"] },
      }).objective,
    ).toEqual({ type: "terminal_output", targetLines: ["PASS", "Tests: 3 passed"] });

    expect(
      issuesOf({ ...validInput(), objective: { type: "terminal_output", lines: [] } }),
    ).not.toEqual([]);
  });
});
