import { describe, expect, it } from "vitest";

import {
  parseWorkspaceExercise,
  type WorkspaceExercise,
  type WorkspaceSolution,
} from "@tutor-nvim/exercise-schema";
import { activeBuffer, activeTab, layoutText } from "@tutor-nvim/workspace-engine";

import {
  advanceAttempt,
  checkExercise,
  evaluateAttempt,
  evaluateWorkspaceGoal,
  goalMet,
  simulateWorkspaceSolution,
  startAttempt,
} from "./index";

/**
 * Replay of a workspace solution (S5, T4): the actions of a declared solution are applied through
 * the engine, the end state is judged by the objective and the cost in actions is what the strategy
 * grades. A refused action is a content bug, never a learner error.
 */

function exercise(): WorkspaceExercise {
  return parseWorkspaceExercise({
    schemaVersion: 1,
    kind: "workspace",
    id: "workspace-test-001",
    slug: "workspace.test.split-001",
    title: "Split the window side by side",
    skillIds: ["vim.navigation.atomic"],
    mode: "learn",
    difficulty: 1,
    initialState: { files: { "src/main.ts": "one" }, path: "src/main.ts", cwd: "/project" },
    objective: {
      type: "all",
      goals: [
        { type: "layout", text: "side(leaf, leaf)" },
        { type: "focus", leaf: 1 },
      ],
    },
    solutions: [
      { actions: ["window.split-side-by-side"], classification: "optimal" },
      {
        actions: ["window.split-side-by-side", "window.focus-left", "window.focus-right"],
        classification: "valid",
      },
    ],
  });
}

const action = (name: WorkspaceSolution["actions"][number]["action"]) => ({ action: name });

/** A solution declared for the replay only; it is not one the exercise blesses. */
const adHoc = (...names: WorkspaceSolution["actions"][number]["action"][]): WorkspaceSolution => ({
  actions: names.map(action),
  classification: "valid",
});

/** `file.open` and `file.new` name the file they act on; the other actions act on the focus. */
const pathed = (
  name: WorkspaceSolution["actions"][number]["action"],
  path: string,
): WorkspaceSolution["actions"][number] => ({ action: name, path });

/** The project pickers name the query they narrow by (T5c). */
const queried = (
  name: WorkspaceSolution["actions"][number]["action"],
  query: string,
): WorkspaceSolution["actions"][number] => ({ action: name, query });

/** A story about files: opening `src/other.ts` is the objective, whichever tool does it (T4b). */
function fileExercise(): WorkspaceExercise {
  return parseWorkspaceExercise({
    schemaVersion: 1,
    kind: "workspace",
    id: "workspace-test-002",
    slug: "workspace.test.open-file-001",
    title: "Open another file",
    skillIds: ["workspace.file.open"],
    mode: "learn",
    difficulty: 1,
    initialState: {
      files: { "src/main.ts": "one", "src/other.ts": "two" },
      path: "src/main.ts",
      cwd: "/project",
    },
    objective: { type: "active_file", path: "src/other.ts" },
    solutions: [{ actions: [pathed("file.open", "src/other.ts")], classification: "optimal" }],
  });
}

/** A story about creating a file: the objective is the buffer, the disk follows on save. */
function newFileExercise(): WorkspaceExercise {
  return parseWorkspaceExercise({
    schemaVersion: 1,
    kind: "workspace",
    id: "workspace-test-003",
    slug: "workspace.test.new-file-001",
    title: "Create a file",
    skillIds: ["workspace.file.new"],
    mode: "learn",
    difficulty: 1,
    initialState: { files: { "src/main.ts": "one" }, path: "src/main.ts", cwd: "/project" },
    objective: { type: "active_file", path: "src/notes.md" },
    solutions: [{ actions: [pathed("file.new", "src/notes.md")], classification: "optimal" }],
  });
}

describe("simulateWorkspaceSolution replays actions through the engine", () => {
  it("reaches the end state of the objective with the optimal solution", () => {
    const ex = exercise();
    const optimal = ex.solutions[0];
    if (optimal === undefined) throw new Error("the fixture declares an optimal solution");

    const replay = simulateWorkspaceSolution(ex, optimal);

    expect(replay.refused).toBeNull();
    expect(replay.actions).toEqual([action("window.split-side-by-side")]);
    const tab = activeTab(replay.state);
    if (tab === undefined) throw new Error("the replay left the workspace without a tab");
    expect(layoutText(tab.root)).toBe("side(leaf, leaf)");
    expect(goalMet(ex, replay)).toBe(true);
    expect(evaluateWorkspaceGoal(ex, replay.state)).toEqual({
      met: true,
      objective: { met: true, failures: [] },
    });
  });

  it("fails a solution that reaches another end state, naming the objective it missed", () => {
    const ex = exercise();
    const wrong = adHoc("window.split-stacked");

    const replay = simulateWorkspaceSolution(ex, wrong);
    const evaluation = evaluateAttempt(ex, replay);

    expect(replay.refused).toBeNull();
    expect(goalMet(ex, replay)).toBe(false);
    expect(evaluation.success).toBe(false);
    expect(evaluation.strategy).toBe("failed");
    expect(evaluateWorkspaceGoal(ex, replay.state).objective.failures).toEqual([
      'layout: expected "side(leaf, leaf)", found "stacked(leaf, leaf)"',
    ]);
  });

  it("stops at the first action the engine refuses and says which one it was", () => {
    const ex = exercise();
    const replay = simulateWorkspaceSolution(
      ex,
      adHoc("window.split-side-by-side", "window.close", "window.close"),
    );

    // The first close puts the tab back to one window; the second cannot close the last one, so the
    // replay stops there instead of encoding a state the engine never produces.
    expect(replay.refused).toEqual({
      action: action("window.close"),
      index: 2,
      reason: "window.close: the last window cannot be closed",
    });
    expect(replay.actions).toEqual([action("window.split-side-by-side"), action("window.close")]);
    const tab = activeTab(replay.state);
    expect(tab === undefined ? "" : layoutText(tab.root)).toBe("leaf");
  });

  it("reports an action no layer can apply as a content bug naming the exercise and the action", () => {
    const ex = exercise();
    // `motion.word-forward` is in the vocabulary and a layer binds it, but a workspace article is not
    // edited by a motion: the workspace engine applies none, so a story written this way could never
    // be solved and the gate says which action is missing. (T7a1 made this pin move again: it named
    // `app.launch-terminal` until a terminal existed.)
    const broken = {
      ...ex,
      solutions: [{ ...ex.solutions[0]!, actions: [action("motion.word-forward")] }],
    };

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.split-001/);
    expect(errors.join("\n")).toMatch(/solution 1/);
    expect(errors.join("\n")).toMatch(/motion\.word-forward/);
    expect(errors.join("\n")).toMatch(/Unknown workspace action: motion\.word-forward/);
  });

  it("reports a picker action that names no query with the query's own message", () => {
    const ex = exercise();
    // A picker is a query over the fixed project (T5c), so a `file.find` without a query is refused
    // for what it is missing rather than as an unknown action.
    const broken = { ...ex, solutions: [{ ...ex.solutions[0]!, actions: [action("file.find")] }] };

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.split-001/);
    expect(errors.join("\n")).toMatch(/solution 1/);
    expect(errors.join("\n")).toMatch(/file\.find/);
    expect(errors.join("\n")).toMatch(/file\.find: no query given/);
  });

  it("reports an unmet objective as a content bug naming the exercise, the solution and the goal", () => {
    const ex = exercise();
    const broken = {
      ...ex,
      solutions: [
        { ...ex.solutions[0]! },
        { actions: [action("window.split-stacked")], classification: "valid" as const },
      ],
    };

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.split-001: solution 2/);
    expect(errors.join("\n")).toMatch(/does not reach the objective/);
    expect(errors.join("\n")).toMatch(
      /layout: expected "side\(leaf, leaf\)", found "stacked\(leaf, leaf\)"/,
    );
  });

  it("grades a longer action list lower without ever failing a learner who got there", () => {
    const ex = exercise();

    // Zooming once and restoring it changes nothing an objective asserts, so both runs solve the
    // task; the extra actions are what the classification is asked to notice.
    const longer = evaluateAttempt(
      ex,
      simulateWorkspaceSolution(ex, adHoc("window.split-side-by-side", "window.zoom")),
    );
    const longest = evaluateAttempt(
      ex,
      simulateWorkspaceSolution(
        ex,
        adHoc("window.split-side-by-side", "window.zoom", "window.zoom"),
      ),
    );

    expect(longer.success).toBe(true);
    expect(longer.strategy).toBe("valid");
    expect(longest.success).toBe(true);
    expect(longest.strategy).toBe("inefficient");
    expect(longest.metrics.errors).toBe(0);
  });

  it("gives the same state for the same solution and leaves the exercise untouched", () => {
    const ex = exercise();
    const before = JSON.stringify(ex);
    const first = simulateWorkspaceSolution(ex, ex.solutions[0]!);
    const second = simulateWorkspaceSolution(ex, ex.solutions[0]!);

    expect(second.state).toEqual(first.state);
    expect(JSON.stringify(ex)).toBe(before);
  });

  it("refuses key input through the vim path, since the workspace has its own", () => {
    // A key of a story goes through `recordWorkspaceKey`, which dispatches the workspace engine, so
    // `recordInput` says which function to use instead of dispatching the wrong engine (T8, T9).
    const ex = exercise();
    const attempt = startAttempt(ex, 0);
    expect(attempt.kind).toBe("workspace");
    expect(attempt.actions).toEqual([]);
    expect(attempt.steps).toEqual([]);
    expect(() => advanceAttempt(ex, attempt, { key: "x", timestamp: 10 })).toThrow(
      /recordWorkspaceKey/,
    );
  });

  it("does not accept the initial state as a solved workspace", () => {
    const ex = exercise();
    // The objective asks for a split, so an attempt that does nothing is a failure, not a pass.
    expect(checkExercise(ex)).toEqual([]);
    expect(
      goalMet(ex, simulateWorkspaceSolution(ex, { actions: [], classification: "optimal" })),
    ).toBe(false);
  });
});

/*
 * T4b: `file.open` and `file.new` name the file they act on, so the replay hands the solution's path
 * to the engine. A story can therefore reach the state `:e src/other.ts` reaches, without writing
 * one blessed keystroke string into content (S5).
 */
describe("simulateWorkspaceSolution passes the path a file action names", () => {
  it("opens the named file and reaches the objective about the active file", () => {
    const ex = fileExercise();
    const solution = ex.solutions[0];
    if (solution === undefined) throw new Error("the fixture declares a solution");

    const replay = simulateWorkspaceSolution(ex, solution);

    expect(replay.refused).toBeNull();
    expect(replay.actions).toEqual([pathed("file.open", "src/other.ts")]);
    expect(activeBuffer(replay.state).path).toBe("src/other.ts");
    expect(replay.state.files).toEqual({
      "src/main.ts": "one",
      "src/other.ts": "two",
    });
    expect(goalMet(ex, replay)).toBe(true);
    expect(checkExercise(ex)).toEqual([]);
  });

  it("opens an empty buffer for a path the disk does not have, writing nothing yet", () => {
    const ex = newFileExercise();
    const solution = ex.solutions[0];
    if (solution === undefined) throw new Error("the fixture declares a solution");

    const replay = simulateWorkspaceSolution(ex, solution);

    expect(replay.refused).toBeNull();
    expect(replay.actions).toEqual([pathed("file.new", "src/notes.md")]);
    expect(activeBuffer(replay.state).path).toBe("src/notes.md");
    // The buffer is what the objective asserts; the file appears on save, not here.
    expect(replay.state.files["src/notes.md"]).toBeUndefined();
    expect(goalMet(ex, replay)).toBe(true);
    expect(checkExercise(ex)).toEqual([]);
  });

  it("stops at a file action that names no path instead of opening the active file again", () => {
    const ex = fileExercise();

    const replay = simulateWorkspaceSolution(ex, adHoc("file.open"));

    expect(replay.refused).toEqual({
      action: action("file.open"),
      index: 0,
      reason: "file.open: no path given",
    });
    expect(goalMet(ex, replay)).toBe(false);
  });
});

/**
 * A story about typing and saving: `edit.insert` is what lets content say what is written, so the
 * objective can assert the disk (L9). Typing is never a layer's keystroke, so the action carries the
 * text the way `file.open` carries its path.
 */
function editSaveExercise(): WorkspaceExercise {
  return parseWorkspaceExercise({
    schemaVersion: 1,
    kind: "workspace",
    id: "workspace-test-004",
    slug: "workspace.test.edit-save-001",
    title: "Write a line and save it",
    skillIds: ["workspace.file.edit"],
    mode: "learn",
    difficulty: 1,
    initialState: { files: { "src/notes.md": "" }, path: "src/notes.md", cwd: "/project" },
    objective: { type: "file_text", path: "src/notes.md", text: "two" },
    solutions: [
      {
        actions: [{ action: "edit.insert", text: "two" }, { action: "file.save" }],
        classification: "optimal",
      },
    ],
  });
}

describe("a solution may type text (edit.insert, L9)", () => {
  it("replays edit.insert and file.save to the text the objective asserts on disk", () => {
    const ex = editSaveExercise();
    const optimal = ex.solutions[0];
    if (optimal === undefined) throw new Error("the fixture declares an optimal solution");

    const replay = simulateWorkspaceSolution(ex, optimal);

    expect(replay.refused).toBeNull();
    expect(replay.state.files["src/notes.md"]).toBe("two");
    expect(activeBuffer(replay.state).modified).toBe(false);
    expect(goalMet(ex, replay)).toBe(true);
    expect(checkExercise(ex)).toEqual([]);
  });

  it("reports an insert the engine refuses as a content bug, not as a learner error", () => {
    const ex = editSaveExercise();
    const broken = {
      ...ex,
      solutions: [
        {
          ...ex.solutions[0]!,
          actions: [{ action: "edit.insert" as const, text: "" }, { action: "file.save" as const }],
        },
      ],
    };

    const replay = simulateWorkspaceSolution(broken, broken.solutions[0]!);
    expect(replay.refused).toEqual({
      action: { action: "edit.insert", text: "" },
      index: 0,
      reason: "edit.insert: the text to type is empty",
    });

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.edit-save-001: solution 1/);
    expect(errors.join("\n")).toMatch(/edit\.insert: the text to type is empty/);
  });
});

/**
 * A story that greps the project and opens the file of a match (story 3, T5c): `grep.project`
 * records the rows in the state instead of opening a picker, and the objective asserts both the
 * rows and the file the learner then opens. No scoring and no timer, so the replay is the state.
 */
function grepExercise(): WorkspaceExercise {
  return parseWorkspaceExercise({
    schemaVersion: 1,
    kind: "workspace",
    id: "workspace-test-005",
    slug: "workspace.test.grep-project-001",
    title: "Grep the project and open the file of a match",
    skillIds: ["neovim.search.grep-project"],
    mode: "learn",
    difficulty: 2,
    initialState: {
      files: {
        "src/server.ts": "export const server = { port: config.port };",
        "src/config.ts": "export const config = { port: 3000 };",
      },
      path: "src/server.ts",
      cwd: "/project",
    },
    objective: {
      type: "all",
      goals: [
        { type: "active_file", path: "src/config.ts" },
        {
          type: "grep_matches",
          matches: [
            { path: "src/config.ts", line: 1, text: "export const config = { port: 3000 };" },
          ],
        },
      ],
    },
    solutions: [
      {
        actions: [queried("grep.project", "3000"), pathed("file.open", "src/config.ts")],
        classification: "optimal",
      },
    ],
  });
}

describe("a solution may search the project (grep.project, T5c)", () => {
  it("records the rows the objective asserts and then opens the file of a match", () => {
    const ex = grepExercise();
    const optimal = ex.solutions[0];
    if (optimal === undefined) throw new Error("the fixture declares an optimal solution");

    const replay = simulateWorkspaceSolution(ex, optimal);

    expect(replay.refused).toBeNull();
    expect(replay.actions).toEqual([
      queried("grep.project", "3000"),
      pathed("file.open", "src/config.ts"),
    ]);
    expect(replay.state.matches).toEqual([
      { path: "src/config.ts", line: 1, text: "export const config = { port: 3000 };" },
    ]);
    expect(activeBuffer(replay.state).path).toBe("src/config.ts");
    expect(goalMet(ex, replay)).toBe(true);
    expect(checkExercise(ex)).toEqual([]);
  });

  it("reports a query that matches nothing as a content bug naming the query", () => {
    const ex = grepExercise();
    const broken = {
      ...ex,
      solutions: [
        {
          ...ex.solutions[0]!,
          actions: [queried("grep.project", "sql"), pathed("file.open", "src/config.ts")],
        },
      ],
    };

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.grep-project-001/);
    expect(errors.join("\n")).toMatch(/solution 1/);
    expect(errors.join("\n")).toMatch(/grep\.project: no line matches "sql"/);
  });
});

/**
 * A story that opens a terminal and runs the tests in it (story 19, T7a1). The terminal is a window
 * on a session, so a launch is a split and a run appends the output the exercise declared: the
 * replay needs no process, and `terminal_output` is what the learner reads.
 */
function terminalExercise(): WorkspaceExercise {
  return parseWorkspaceExercise({
    schemaVersion: 1,
    kind: "workspace",
    id: "workspace-test-006",
    slug: "workspace.test.terminal-001",
    title: "Open a terminal and run the tests",
    skillIds: ["neovim.terminal.run"],
    mode: "learn",
    difficulty: 2,
    initialState: {
      files: { "src/main.ts": "one" },
      path: "src/main.ts",
      cwd: "/project",
      terminal: { title: "dev", commands: { "npm test": ["Tests: 3 passed"] } },
    },
    objective: { type: "terminal_output", lines: ["Tests: 3 passed"] },
    solutions: [
      {
        actions: [{ action: "app.launch-terminal" }, { action: "shell.run", command: "npm test" }],
        classification: "optimal",
      },
    ],
  });
}

describe("a solution may open a terminal and run a command (T7a1)", () => {
  it("replays the launch and the run into the lines the objective asserts", () => {
    const ex = terminalExercise();
    const optimal = ex.solutions[0];
    if (optimal === undefined) throw new Error("the fixture declares an optimal solution");

    const replay = simulateWorkspaceSolution(ex, optimal);

    expect(replay.refused).toBeNull();
    expect(replay.state.terminals).toEqual([
      {
        id: "terminal:1",
        title: "dev",
        cwd: "/project",
        entries: [{ command: "npm test", output: ["Tests: 3 passed"] }],
        // The whole session: `shell.run` appends an entry and never touches the prompt (T7a3).
        pending: "",
      },
    ]);
    expect(goalMet(ex, replay)).toBe(true);
    expect(checkExercise(ex)).toEqual([]);
  });

  it("reports a command the exercise never declared as a content bug naming it", () => {
    const ex = terminalExercise();
    const broken = {
      ...ex,
      solutions: [
        {
          ...ex.solutions[0]!,
          actions: [
            { action: "app.launch-terminal" as const },
            { action: "shell.run" as const, command: "npm run build" },
          ],
        },
      ],
    };

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.terminal-001/);
    expect(errors.join("\n")).toMatch(/solution 1/);
    expect(errors.join("\n")).toMatch(/shell\.run: no output is declared for "npm run build"/);
  });
});

/**
 * Story 17 replayed: a window leaves one tab for another, and the story asserts where it ended up
 * (T7a2). The solution names the tab the way it names a path, and the replay hands that tab to the
 * engine, so the action means the same thing in a replay as in a learner's session.
 */
describe("a solution that moves a window into another tab", () => {
  function moveExercise(): WorkspaceExercise {
    return parseWorkspaceExercise({
      schemaVersion: 1,
      kind: "workspace",
      id: "workspace-test-move-001",
      slug: "workspace.test.move-001",
      title: "Move a window to another workspace",
      skillIds: ["neovim.workspace.move"],
      mode: "learn",
      difficulty: 4,
      initialState: { files: { "src/main.ts": "one" }, path: "src/main.ts", cwd: "/project" },
      objective: {
        type: "all",
        goals: [
          { type: "layout", text: "side(leaf, leaf)" },
          { type: "windows", paths: ["src/main.ts", "src/main.ts"] },
          { type: "focus", leaf: 0 },
        ],
      },
      solutions: [
        {
          actions: [
            "tab.new",
            "tab.previous",
            "window.split-side-by-side",
            { action: "workspace.move", tab: "tab:2" },
            "tab.next",
          ],
          classification: "optimal",
        },
      ],
    });
  }

  it("moves the window into the tab the story names and reaches the objective", () => {
    const ex = moveExercise();
    const replay = simulateWorkspaceSolution(ex, ex.solutions[0]!);

    expect(replay.refused).toBeNull();
    // The source tab kept one window and the target is now a split of two.
    expect(replay.state.tabs.map((tab) => layoutText(tab.root))).toEqual([
      "leaf",
      "side(leaf, leaf)",
    ]);
    expect(activeTab(replay.state)?.id).toBe("tab:2");
    expect(activeBuffer(replay.state).path).toBe("src/main.ts");
    expect(goalMet(ex, replay)).toBe(true);
    expect(checkExercise(ex)).toEqual([]);
  });
});
