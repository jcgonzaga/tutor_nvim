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
    // `app.launch-terminal` is in the vocabulary, but the simulation launches no application (S6):
    // a story written this way could never be solved, and the gate says which action is missing.
    const broken = {
      ...ex,
      solutions: [{ ...ex.solutions[0]!, actions: [action("app.launch-terminal")] }],
    };

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.split-001/);
    expect(errors.join("\n")).toMatch(/solution 1/);
    expect(errors.join("\n")).toMatch(/app\.launch-terminal/);
    expect(errors.join("\n")).toMatch(/Unknown workspace action: app\.launch-terminal/);
  });

  it("reports an action that needs a picker with the picker's own message", () => {
    const ex = exercise();
    // A picker is not modelled either (S6), so `file.find` is refused for a different reason and
    // the learner is told which thing is missing rather than an unknown action.
    const broken = { ...ex, solutions: [{ ...ex.solutions[0]!, actions: [action("file.find")] }] };

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.split-001/);
    expect(errors.join("\n")).toMatch(/solution 1/);
    expect(errors.join("\n")).toMatch(/file\.find/);
    expect(errors.join("\n")).toMatch(
      /file\.find: no picker is modelled in the simulated workspace/,
    );
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

  it("refuses key input rather than recording keys that changed no state", () => {
    // A workspace attempt is spent in actions: a key only becomes one once the learner's layer
    // resolves it, so the key path says so instead of pretending the key did something (T8, T9).
    const ex = exercise();
    const attempt = startAttempt(ex, 0);
    expect(attempt.kind).toBe("workspace");
    expect(attempt.actions).toEqual([]);
    expect(() => advanceAttempt(ex, attempt, { key: "x", timestamp: 10 })).toThrow(
      /made of actions, not keys/,
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
