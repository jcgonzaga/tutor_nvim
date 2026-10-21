import type {
  Exercise,
  Objective,
  ShellExercise,
  ShellObjective,
  VimExercise,
} from "@tutor-nvim/exercise-schema";
import {
  getNode,
  joinPath,
  resolveParts,
  splitPath,
  type ShellState,
} from "@tutor-nvim/shell-engine";
import type { VimState } from "@tutor-nvim/vim-engine";
import type { Attempt } from "./attempt";

export interface GoalEvaluation {
  readonly met: boolean;
  /** Per-check detail for the objective (compound goals list every sub-goal). */
  readonly objective: ObjectiveEvaluation;
  /** `null` when the exercise does not constrain the final mode. */
  readonly modeMatches: boolean | null;
}

export type ObjectiveEvaluation =
  | { readonly type: "buffer_equals" | "cursor_at" | "mode_equals"; readonly met: boolean }
  | { readonly type: "all"; readonly met: boolean; readonly goals: readonly ObjectiveEvaluation[] };

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

export function evaluateObjective(objective: Objective, state: VimState): ObjectiveEvaluation {
  switch (objective.type) {
    case "buffer_equals":
      return { type: objective.type, met: sameLines(state.buffer.lines, objective.targetLines) };
    case "cursor_at":
      return {
        type: objective.type,
        met:
          state.cursor.line === objective.position.line &&
          state.cursor.column === objective.position.column,
      };
    case "mode_equals":
      return { type: objective.type, met: state.mode === objective.mode };
    case "all": {
      const goals = objective.goals.map((goal) => evaluateObjective(goal, state));
      return { type: "all", met: goals.every((goal) => goal.met), goals };
    }
  }
}

/**
 * Deterministic goal check: is the state a valid end state for the exercise?
 * Says nothing about *how* the learner got there (see `classifyStrategy`).
 */
export function evaluateGoal(exercise: VimExercise, state: VimState): GoalEvaluation {
  const objective = evaluateObjective(exercise.objective, state);
  const modeMatches = exercise.evaluation.requireFinalNormalMode ? state.mode === "normal" : null;
  return { met: objective.met && modeMatches !== false, objective, modeMatches };
}

export type ShellObjectiveEvaluation =
  | {
      readonly type: "fs_matches" | "cwd_equals" | "last_output_equals" | "last_output_contains";
      readonly met: boolean;
    }
  | {
      readonly type: "all";
      readonly met: boolean;
      readonly goals: readonly ShellObjectiveEvaluation[];
    };

/** `""` is the home directory; everything else is relative to it, as content is written. */
const fromHome = (state: ShellState, path: string): string[] =>
  resolveParts(splitPath(state.env.HOME ?? "/"), path === "" ? "." : path);

export function evaluateShellObjective(
  objective: ShellObjective,
  state: ShellState,
): ShellObjectiveEvaluation {
  switch (objective.type) {
    case "fs_matches": {
      const files = Object.entries(objective.files).every(([path, content]) => {
        const node = getNode(state.root, fromHome(state, path));
        return node?.kind === "file" && node.content === content;
      });
      const dirs = objective.dirs.every(
        (path) => getNode(state.root, fromHome(state, path))?.kind === "dir",
      );
      const absent = objective.absent.every(
        (path) => getNode(state.root, fromHome(state, path)) === undefined,
      );
      const modes = Object.entries(objective.modes).every(([path, mode]) => {
        const node = getNode(state.root, fromHome(state, path));
        return node !== undefined && (node.mode & 0o777) === (mode & 0o777);
      });
      return { type: "fs_matches", met: files && dirs && absent && modes };
    }
    case "cwd_equals":
      return {
        type: "cwd_equals",
        met: joinPath(state.cwd) === joinPath(fromHome(state, objective.path)),
      };
    case "last_output_equals":
      return {
        type: "last_output_equals",
        met: state.transcript[state.transcript.length - 1]?.output === objective.text,
      };
    case "last_output_contains":
      return {
        type: "last_output_contains",
        met: (state.transcript[state.transcript.length - 1]?.output ?? "").includes(objective.text),
      };
    case "all": {
      const goals = objective.goals.map((goal) => evaluateShellObjective(goal, state));
      return { type: "all", met: goals.every((goal) => goal.met), goals };
    }
  }
}

export interface ShellGoalEvaluation {
  readonly met: boolean;
  readonly objective: ShellObjectiveEvaluation;
}

export function evaluateShellGoal(exercise: ShellExercise, state: ShellState): ShellGoalEvaluation {
  const objective = evaluateShellObjective(exercise.objective, state);
  return { met: objective.met, objective };
}

/**
 * Is the attempt in a valid end state? One question for both simulators; the attempt and its
 * exercise always have the same kind.
 */
export function goalMet(exercise: Exercise, attempt: Attempt): boolean {
  if (exercise.kind === "shell" && attempt.kind === "shell") {
    return evaluateShellGoal(exercise, attempt.state).met;
  }
  if (exercise.kind === "vim" && attempt.kind === "vim") {
    return evaluateGoal(exercise, attempt.state).met;
  }
  throw new Error(`a ${attempt.kind} attempt cannot be judged by a ${exercise.kind} exercise`);
}
