import { describe, expect, it } from "vitest";

import {
  parseWorkspaceExercise,
  type WorkspaceExercise,
  type WorkspaceSolution,
} from "@tutor-nvim/exercise-schema";
import { layoutText, activeTab } from "@tutor-nvim/workspace-engine";

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

  it("reports a solution the engine cannot run as a content bug naming the exercise and the action", () => {
    const ex = exercise();
    // `file.open` is an action the keymap vocabulary has, but the workspace engine applies window,
    // tab and workspace actions only: a story written this way could never be solved.
    const broken = { ...ex, solutions: [{ ...ex.solutions[0]!, actions: [action("file.open")] }] };

    const errors = checkExercise(broken);
    expect(errors.join("\n")).toMatch(/workspace\.test\.split-001/);
    expect(errors.join("\n")).toMatch(/solution 1/);
    expect(errors.join("\n")).toMatch(/file\.open/);
    expect(errors.join("\n")).toMatch(/Unknown workspace action: file\.open/);
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
