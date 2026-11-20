import { describe, expect, it } from "vitest";

import {
  parseWorkspaceExercise,
  type WorkspaceExercise,
  type WorkspaceExerciseInput,
} from "@tutor-nvim/exercise-schema";
import { bufferToText } from "@tutor-nvim/vim-engine";
import {
  activeTab,
  bufferByPath,
  focusedTerminalOutput,
  layoutText,
  windowPaths,
  workspaceObjectiveView,
  type WorkspaceState,
} from "@tutor-nvim/workspace-engine";

import {
  advanceWorkspaceAttempt,
  advanceWorkspaceKey,
  evaluateAttempt,
  evaluateWorkspaceObjective,
  goalMet,
  recordInput,
  recordWorkspaceAction,
  simulateWorkspaceSolution,
  startAttempt,
  type WorkspaceAttempt as AttemptOfWorkspace,
} from "./index";

/**
 * A workspace attempt that can advance (T8): a learner's keys reach an action, the action is applied
 * through the engine the content gate uses, and the list of actions is what a replay and the strategy
 * grade work from. The attempt is judged by the objective, never by a keystroke (AGENTS.md 13, S5).
 */

function exerciseWith(overrides: Partial<WorkspaceExerciseInput> = {}): WorkspaceExercise {
  return parseWorkspaceExercise({
    schemaVersion: 1,
    kind: "workspace",
    id: "workspace-attempt-001",
    slug: "workspace.attempt.split-001",
    title: "Split the window side by side",
    skillIds: ["vim.navigation.atomic"],
    mode: "learn",
    difficulty: 1,
    initialState: { files: { "src/main.ts": "one" }, path: "src/main.ts", cwd: "/project" },
    objective: { type: "layout", text: "side(leaf, leaf)" },
    solutions: [{ actions: ["window.split-side-by-side"], classification: "optimal" }],
    ...overrides,
  });
}

/** Two files on the disk, so a file action has a second one to open. */
const filesExercise = () =>
  exerciseWith({
    initialState: {
      files: { "src/main.ts": "one", "src/other.ts": "two" },
      path: "src/main.ts",
      cwd: "/project",
    },
    objective: { type: "active_file", path: "src/other.ts" },
    solutions: [
      { actions: [{ action: "file.open", path: "src/other.ts" }], classification: "optimal" },
    ],
  });

/** A workspace attempt of the fixture, narrowed once so the tests read as the learner's steps. */
function workspaceAttemptOf(exercise: WorkspaceExercise, startedAt = 0): AttemptOfWorkspace {
  const attempt = startAttempt(exercise, startedAt);
  if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");
  return attempt;
}

/** The text an open buffer holds, read through the engine's own buffer lookup. */
function bufferText(state: WorkspaceState, path: string): string {
  const buffer = bufferByPath(state, path);
  if (buffer === undefined) throw new Error(`no buffer is open for ${path}`);
  return bufferToText(buffer.editor.buffer);
}

/** The layout of the tab the keys are in, printed the way the objective prints it. */
function layoutOf(exercise: WorkspaceExercise, attempt: ReturnType<typeof startAttempt>) {
  if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");
  const tab = activeTab(attempt.state);
  if (tab === undefined) throw new Error("the workspace always has an active tab");
  expect(exercise.kind).toBe("workspace");
  return layoutText(tab.root);
}

describe("recordWorkspaceAction", () => {
  it("applies the action to the attempt's workspace state and appends it to the actions", () => {
    const exercise = exerciseWith();
    const attempt = startAttempt(exercise, 1000);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");

    const recording = recordWorkspaceAction(attempt, "window.split-side-by-side");

    expect(recording.applied).toBe(true);
    expect(recording.reason).toBeUndefined();
    expect(recording.attempt.actions).toEqual([{ action: "window.split-side-by-side" }]);
    expect(layoutOf(exercise, recording.attempt)).toBe("side(leaf, leaf)");
    // The attempt it was given is untouched: the recording is a new attempt, like every other kind.
    expect(attempt.actions).toEqual([]);
    expect(layoutOf(exercise, attempt)).toBe("leaf");
  });

  it("leaves the attempt unchanged, with the engine's own reason, when the action cannot apply", () => {
    const exercise = filesExercise();
    const attempt = startAttempt(exercise, 0);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");

    // A file action with no path is refused by the engine, which is where the words come from.
    const recording = recordWorkspaceAction(attempt, "file.open");

    expect(recording.applied).toBe(false);
    expect(recording.reason).toBe("file.open: no path given");
    expect(recording.attempt).toBe(attempt);
    expect(recording.attempt.actions).toEqual([]);
  });

  it("records the path an action needs, so a replay reaches the same workspace", () => {
    const exercise = filesExercise();
    const attempt = startAttempt(exercise, 0);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");

    const recording = recordWorkspaceAction(attempt, "file.open", { path: "src/other.ts" });

    expect(recording.applied).toBe(true);
    expect(recording.attempt.actions).toEqual([{ action: "file.open", path: "src/other.ts" }]);
    expect(bufferText(recording.attempt.state, "src/other.ts")).toBe("two");
    expect(goalMet(exercise, recording.attempt)).toBe(true);
  });

  it("records the text an action types, so a replay writes the same words", () => {
    const exercise = exerciseWith({
      // `edit.insert` starts where a fresh buffer leaves the cursor (top of the file), so it
      // prepends: content has to say the same, and this pins that a typed action keeps it (L10).
      objective: { type: "file_text", path: "src/main.ts", text: " moreone" },
      solutions: [
        {
          actions: [{ action: "edit.insert", text: " more" }, "file.save"],
          classification: "optimal",
        },
      ],
    });
    const attempt = startAttempt(exercise, 0);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");

    const typed = recordWorkspaceAction(attempt, "edit.insert", { text: " more" });
    expect(typed.attempt.actions).toEqual([{ action: "edit.insert", text: " more" }]);
    const saved = recordWorkspaceAction(typed.attempt, "file.save");

    expect(saved.applied).toBe(true);
    expect(saved.attempt.state.files["src/main.ts"]).toBe(" moreone");
    // The same actions replayed from the exercise are the same workspace: nothing about the learner's
    // path is remembered outside the action list.
    const replay = simulateWorkspaceSolution(exercise, {
      actions: [...saved.attempt.actions],
      classification: "optimal",
    });
    expect(replay.state).toEqual(saved.attempt.state);
    expect(replay.refused).toBeNull();
  });

  it("reaches the same state when its recorded actions are replayed", () => {
    const exercise = exerciseWith();
    const attempt = startAttempt(exercise, 0);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");

    const split = recordWorkspaceAction(attempt, "window.split-side-by-side");
    const zoomed = recordWorkspaceAction(split.attempt, "window.zoom");

    const replay = simulateWorkspaceSolution(exercise, {
      actions: [...zoomed.attempt.actions],
      classification: "optimal",
    });

    expect(zoomed.attempt.actions).toEqual([
      { action: "window.split-side-by-side" },
      { action: "window.zoom" },
    ]);
    expect(replay.state).toEqual(zoomed.attempt.state);
    expect(windowPaths(replay.state)).toEqual(windowPaths(zoomed.attempt.state));
  });
});

describe("advanceWorkspaceAttempt", () => {
  it("ends the attempt the first time the objective is met, and evaluates it", () => {
    const exercise = exerciseWith();
    const attempt = startAttempt(exercise, 1000);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");
    expect(attempt.completedAt).toBeNull();

    const recording = advanceWorkspaceAttempt(
      exercise,
      attempt,
      "window.split-side-by-side",
      {},
      1500,
    );

    expect(recording.applied).toBe(true);
    expect(recording.attempt.completedAt).toBe(1500);
    // A finished attempt is evaluated by the objective, and by the strategy rules the same unit uses.
    expect(
      evaluateWorkspaceObjective(
        exercise.objective,
        workspaceObjectiveView(recording.attempt.state),
      ).met,
    ).toBe(true);
    const evaluation = evaluateAttempt(exercise, recording.attempt);
    expect(evaluation.success).toBe(true);
    expect(evaluation.strategy).toBe("optimal");
    expect(evaluation.metrics.keystrokes).toBe(1);
  });

  it("keeps the attempt going while the objective is not met", () => {
    const exercise = exerciseWith();
    const attempt = startAttempt(exercise, 0);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");

    // Zooming applies and changes nothing an objective asserts, so the attempt stays open.
    const recording = advanceWorkspaceAttempt(exercise, attempt, "window.zoom", {}, 40);

    expect(recording.applied).toBe(true);
    expect(recording.attempt.completedAt).toBeNull();
    expect(recording.attempt.actions).toEqual([{ action: "window.zoom" }]);
  });

  it("ignores a further action once the attempt ended, and says why", () => {
    const exercise = exerciseWith();
    const attempt = startAttempt(exercise, 0);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");
    const finished = advanceWorkspaceAttempt(
      exercise,
      attempt,
      "window.split-side-by-side",
      {},
      10,
    ).attempt;

    const after = advanceWorkspaceAttempt(exercise, finished, "window.zoom", {}, 20);

    expect(after.applied).toBe(false);
    expect(after.reason).toBe("the attempt has already ended");
    expect(after.attempt).toBe(finished);
  });

  it("does not record an action the engine refuses while the attempt ends", () => {
    const exercise = filesExercise();
    const attempt = startAttempt(exercise, 0);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");

    const recording = advanceWorkspaceAttempt(exercise, attempt, "file.open", {}, 30);

    expect(recording.applied).toBe(false);
    expect(recording.reason).toBe("file.open: no path given");
    expect(recording.attempt).toBe(attempt);
    expect(recording.attempt.completedAt).toBeNull();
  });
});

/** An exercise whose story happens at a terminal prompt (T7a3, story 19). */
const terminalExercise = () =>
  exerciseWith({
    initialState: {
      files: { "src/main.ts": "one" },
      path: "src/main.ts",
      cwd: "/project",
      terminal: { title: "shell", commands: { "npm test": ["ok 3 tests"] } },
    },
    objective: { type: "terminal_output", lines: ["ok 3 tests"] },
    solutions: [
      {
        actions: ["app.launch-terminal", { action: "shell.run", command: "npm test" }],
        classification: "optimal",
      },
    ],
  });

/** The keys of one typed line, the way the adapter hands them over. */
const typed = (text: string, startedAt = 0) =>
  [...text].map((key, index) => ({ key, timestamp: startedAt + (index + 1) * 10 }));

describe("advanceWorkspaceKey", () => {
  it("types a key no layer claimed into the focused buffer, without ending the attempt", () => {
    const exercise = exerciseWith({
      objective: { type: "buffer_text", path: "src/main.ts", text: "Zone" },
    });
    const attempt = startAttempt(exercise, 0);
    if (attempt.kind !== "workspace") throw new Error("the fixture is a workspace exercise");

    const inserted = advanceWorkspaceKey(exercise, attempt, { key: "i", timestamp: 10 });
    const written = advanceWorkspaceKey(exercise, inserted.attempt, { key: "Z", timestamp: 20 });

    expect(inserted.accepted).toBe(true);
    expect(written.accepted).toBe(true);
    expect(bufferText(written.attempt.state, "src/main.ts")).toBe("Zone");
    // The words the learner typed are in the buffer, so the objective is met and the attempt ended.
    expect(written.attempt.completedAt).toBe(20);
    expect(written.attempt.actions).toEqual([]);
  });

  it("runs a line typed at a terminal prompt, and ends the attempt on what it printed", () => {
    const exercise = terminalExercise();
    const launch = recordWorkspaceAction(workspaceAttemptOf(exercise), "app.launch-terminal");
    expect(launch.applied).toBe(true);

    let attempt = launch.attempt;
    for (const key of typed("npm test")) {
      attempt = advanceWorkspaceKey(exercise, attempt, key).attempt;
    }
    const ran = advanceWorkspaceKey(exercise, attempt, { key: "Enter", timestamp: 200 });

    expect(ran.accepted).toBe(true);
    expect(ran.attempt.completedAt).toBe(200);
    expect(focusedTerminalOutput(ran.attempt.state)).toEqual(["ok 3 tests"]);
    expect(goalMet(exercise, ran.attempt)).toBe(true);
  });

  it("leaves the attempt unchanged, with the engine's reason, when the key is refused", () => {
    const exercise = terminalExercise();
    const launch = recordWorkspaceAction(workspaceAttemptOf(exercise), "app.launch-terminal");
    expect(launch.applied).toBe(true);

    // Enter on an empty prompt asks to run nothing: the engine refuses it and keeps what was typed.
    const ran = advanceWorkspaceKey(exercise, launch.attempt, { key: "Enter", timestamp: 30 });

    expect(ran.accepted).toBe(false);
    expect(ran.reason).toBe("shell.run: the terminal line is empty");
    expect(ran.attempt).toBe(launch.attempt);
  });
});

describe("the workspace attempt keeps the vim and shell behaviour", () => {
  it("still refuses the vim key path, and says which function a workspace key takes", () => {
    const exercise = exerciseWith();
    const attempt = startAttempt(exercise, 0);

    expect(() => recordInput(attempt, { key: "x", timestamp: 5 })).toThrow(/recordWorkspaceKey/);
  });
});

describe("the steps of a workspace attempt (T9)", () => {
  it("records the keys of a `:` command as steps, in order, with no action among them", () => {
    const exercise = filesExercise();
    const keys = [...typed(":e src/other.ts"), { key: "Enter", timestamp: 900 }];
    let attempt = workspaceAttemptOf(exercise);
    for (const key of keys) attempt = advanceWorkspaceKey(exercise, attempt, key).attempt;

    // Nothing a layer claimed, so the story is solved entirely out of keys the engine took itself.
    expect(attempt.actions).toEqual([]);
    expect(attempt.events).toEqual([]);
    expect(attempt.steps.map((step) => step.kind)).toEqual(keys.map(() => "key"));
    expect(attempt.steps[0]).toEqual({ kind: "key", key: keys[0] });
    expect(goalMet(exercise, attempt)).toBe(true);
  });

  it("keeps actions and keys in one ordered list, so a replay knows which came first", () => {
    const exercise = exerciseWith();
    const split = recordWorkspaceAction(workspaceAttemptOf(exercise), "window.split-side-by-side");
    const typedIn = advanceWorkspaceKey(exercise, split.attempt, { key: "i", timestamp: 20 });

    expect(typedIn.accepted).toBe(true);
    expect(typedIn.attempt.steps.map((step) => step.kind)).toEqual(["action", "key"]);
    expect(typedIn.attempt.actions).toEqual([{ action: "window.split-side-by-side" }]);
  });

  it("records no step for a key the engine refused: nothing moved", () => {
    const exercise = terminalExercise();
    const launch = recordWorkspaceAction(workspaceAttemptOf(exercise), "app.launch-terminal");
    const before = launch.attempt.steps.length;
    const refused = advanceWorkspaceKey(exercise, launch.attempt, { key: "Enter", timestamp: 30 });

    expect(refused.accepted).toBe(false);
    expect(refused.attempt.steps).toHaveLength(before);
  });
});
