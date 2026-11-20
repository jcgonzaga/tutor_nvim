import {
  dispatch,
  keyInputFromToken,
  type Position,
  type VimMode,
  type VimState,
} from "@tutor-nvim/vim-engine";
import type { Exercise, VimExercise, WorkspaceSolutionAction } from "@tutor-nvim/exercise-schema";
import { startAttempt, type Attempt } from "./attempt";
import { simulateWorkspaceSolution, type WorkspaceReplay } from "./workspace-replay";

/** A run as it is stored: logical keys (`ci"`, `<Esc>`) and the time of each since the start. */
export interface Run {
  readonly keys: readonly string[];
  readonly times: readonly number[];
  readonly durationMs: number;
}

/** The state of the editor after `index` keys; frame 0 is how the exercise starts. */
export interface ReplayFrame {
  readonly index: number;
  /** The key that produced this frame; `null` for the starting frame. */
  readonly key: string | null;
  readonly accepted: boolean;
  readonly lines: readonly string[];
  readonly cursor: Position;
  readonly mode: VimMode;
  /** Milliseconds since the start at which the key was pressed, when it is known. */
  readonly atMs: number | null;
}

/**
 * Basic replay (T-806): feeds a run's keys back through the engine and returns the editor after
 * each one. It is a pure function of the exercise and the keys, so a stored run replays identically
 * anywhere, and the same code replays the learner's own run, their best run and the declared
 * optimal one.
 */
export function buildReplay(
  exercise: VimExercise,
  run: { readonly keys: readonly string[]; readonly times?: readonly number[] },
): ReplayFrame[] {
  let state = startAttempt(exercise, 0).state;
  const frames: ReplayFrame[] = [frameOf(0, null, true, state, null)];
  run.keys.forEach((token, offset) => {
    const result = dispatch(state, keyInputFromToken(token));
    state = result.state;
    frames.push(frameOf(offset + 1, token, result.accepted, state, run.times?.[offset] ?? null));
  });
  return frames;
}

function frameOf(
  index: number,
  key: string | null,
  accepted: boolean,
  state: VimState,
  atMs: number | null,
): ReplayFrame {
  return {
    index,
    key,
    accepted,
    lines: state.buffer.lines,
    cursor: state.cursor,
    mode: state.mode,
    atMs,
  };
}

/** The run of a finished attempt, in the shape that is stored and replayed. */
export function runOf(attempt: Attempt): Run {
  const end = attempt.completedAt ?? attempt.events[attempt.events.length - 1]?.timestamp;
  return {
    keys: attempt.events.map((event) => event.logicalKey),
    times: attempt.events.map((event) => event.timestamp - attempt.startedAt),
    durationMs: end === undefined ? 0 : end - attempt.startedAt,
  };
}

/**
 * The master's run of an exercise: its shortest declared optimal solution.
 *
 * The two simulators are spent in keys, so the run is their keys. A workspace story is spent in
 * actions (S5), so it has no keys at all: `keys` is empty because nothing was typed, and `actions`
 * is what the declared optimal solution applied when it was replayed through the workspace engine —
 * the same `applyWorkspaceAction` a learner's own attempt runs, never a copy of the declaration
 * (T9). `workspace` is the state that replay reached, so a ghost is drawn from the code the
 * learner's run goes through rather than from a fixture.
 */
export interface MasterRun {
  /** The logical keys of the solution; `[]` for a workspace story, which is spent in actions. */
  readonly keys: readonly string[];
  /** The actions the solution applied, in order; `[]` for a key-based exercise. */
  readonly actions: readonly WorkspaceSolutionAction[];
  /** The workspace the replayed actions reached; `null` for a key-based exercise. */
  readonly workspace: WorkspaceReplay | null;
}

export function masterRun(exercise: Exercise): MasterRun | null {
  const optimal = exercise.solutions.filter((solution) => solution.classification === "optimal");
  if (exercise.kind === "workspace") {
    const solution = optimal.find((candidate) => "actions" in candidate);
    if (!solution || !("actions" in solution)) return null;
    const replay = simulateWorkspaceSolution(exercise, solution);
    return { keys: [], actions: replay.actions, workspace: replay };
  }
  const shortest = optimal
    .filter((solution) => "keys" in solution)
    .sort((a, b) => a.keys.length - b.keys.length)[0];
  return shortest ? { keys: shortest.keys, actions: [], workspace: null } : null;
}

/**
 * A workspace action as a run shows it: the verb and what it acted on, because a story is told with
 * the file it opens and the text it types, not with the verb alone (`file.open src/other.ts`).
 */
const actionOf = (action: WorkspaceSolutionAction): string =>
  [action.action, action.target, action.path, action.text, action.query, action.command, action.tab]
    .filter((part): part is string => part !== undefined)
    .join(" ");

export interface RunSummary {
  readonly label: "YOU" | "MASTER" | "YOUR BEST";
  /**
   * The run as one string: the keys (`hhhhwwci"`) for the simulators, the actions
   * (`file.open src/other.ts`) for a workspace story, which has no keys to show.
   */
  readonly keys: string;
  /** What the run spent, in its own unit: keystrokes, or the actions of a workspace story (S5). */
  readonly keystrokes: number;
  readonly durationMs: number | null;
}

/**
 * Ghost data comparison (T-805), textual: the learner's run next to the master's (the shortest
 * declared optimal solution) and, when it is a different run, their previous best.
 *
 * ```text
 * YOU        hhhhwwci"
 * MASTER     2wci"
 * ```
 *
 * A workspace story prints its actions in place of keys, since it has none: the row is the declared
 * optimal solution, replayed, and its cost is counted in the actions it spent (S5, T9).
 */
export function ghostComparison(
  exercise: Exercise,
  you: { readonly keys: readonly string[]; readonly durationMs: number },
  best?: { readonly keys: readonly string[]; readonly durationMs: number } | null,
): RunSummary[] {
  const rows: RunSummary[] = [
    {
      label: "YOU",
      keys: you.keys.join(""),
      keystrokes: you.keys.length,
      durationMs: you.durationMs,
    },
  ];
  const master = masterRun(exercise);
  if (master) {
    rows.push({
      label: "MASTER",
      // Keys when the run has them; the actions otherwise, because a story is not a key sequence.
      keys: master.keys.join("") || master.actions.map(actionOf).join(" · "),
      keystrokes: master.keys.length + master.actions.length,
      durationMs: null,
    });
  }
  if (best && best.keys.join("") !== you.keys.join("")) {
    rows.push({
      label: "YOUR BEST",
      keys: best.keys.join(""),
      keystrokes: best.keys.length,
      durationMs: best.durationMs,
    });
  }
  return rows;
}
