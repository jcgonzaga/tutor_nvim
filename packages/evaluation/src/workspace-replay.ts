import type {
  WorkspaceExercise,
  WorkspaceSolution,
  WorkspaceSolutionAction,
} from "@tutor-nvim/exercise-schema";
import {
  applyWorkspaceAction,
  createWorkspace,
  type WorkspaceState,
} from "@tutor-nvim/workspace-engine";

import type { WorkspaceAttempt } from "./attempt";
import { engineOptions } from "./workspace-action";

/*
 * Replay of a workspace solution (S5, AGENTS.md 10, 12).
 *
 * A workspace solution is a list of keymap actions, never one tool's keys, so the replay needs no
 * layer: it starts from the exercise's initial state and applies the actions through the engine's
 * own `applyWorkspaceAction`, which is the same code a learner's keys reach. A file action carries
 * the path it names (T4b), so `file.open src/other.ts` reaches the state `:e src/other.ts` reaches,
 * and an insert carries the text it types (L9), so a story can say what it writes and assert the
 * disk after saving.
 * The end state is then judged by the objective, and the cost in actions by the classification.
 *
 * An action the engine refuses is a *content* bug, not a learner error: the story asks for something
 * the workspace cannot do. The replay therefore stops at the first refusal and reports it with the
 * position and the engine's reason, so the content gate can name exactly what to fix.
 */

/** The first action the workspace refused, and where in the solution it was. */
export interface RefusedWorkspaceAction {
  /** The action as the solution declared it. */
  readonly action: WorkspaceSolutionAction;
  /** Its position in the solution, counting from 0. */
  readonly index: number;
  /** Why the engine could not apply it, in the engine's words. */
  readonly reason: string;
}

/**
 * A replayed solution: the workspace at the end, the actions that applied (the cost) and the first
 * refusal, if any. It is a `WorkspaceAttempt`, so `goalMet` and `evaluateAttempt` judge it exactly as
 * they judge a learner's attempt.
 */
export interface WorkspaceReplay extends WorkspaceAttempt {
  readonly refused: RefusedWorkspaceAction | null;
}

/**
 * Applies a solution's actions to a fresh workspace and returns the end state.
 *
 * Deterministic like the engine it drives: no clock, no I/O, no randomness, so the same solution on
 * the same exercise always produces the same state. `stepMs` only stamps the attempt, the way
 * `simulateSolution` does for a key replay.
 */
export function simulateWorkspaceSolution(
  exercise: WorkspaceExercise,
  solution: WorkspaceSolution,
  { startedAt = 0, stepMs = 100 }: { startedAt?: number; stepMs?: number } = {},
): WorkspaceReplay {
  const initialState = createWorkspace({
    files: exercise.initialState.files,
    path: exercise.initialState.path,
    cwd: exercise.initialState.cwd,
    // The terminal the exercise declares, so `app.launch-terminal` and `shell.run` reach the same
    // sessions a learner's actions reach (T7a1).
    terminal: exercise.initialState.terminal,
  });
  let state: WorkspaceState = initialState;
  const applied: WorkspaceSolutionAction[] = [];
  let refused: RefusedWorkspaceAction | null = null;

  for (const [index, action] of solution.actions.entries()) {
    const result = applyWorkspaceAction(state, action.action, engineOptions(action));
    if (!result.applied) {
      refused = {
        action,
        index,
        reason: result.reason ?? `${action.action} could not be applied`,
      };
      break;
    }
    state = result.state;
    applied.push(action);
  }

  return {
    kind: "workspace",
    startedAt,
    initialState,
    state,
    // No key was typed: the attempt is spent in actions, and `actions` is what the strategy grades.
    events: [],
    actions: applied,
    // The whole script's duration, refused action included: the replay itself ended here.
    completedAt: startedAt + solution.actions.length * stepMs,
    hints: [],
    refused,
  };
}
