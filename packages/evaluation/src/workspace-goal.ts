import type { WorkspaceExercise, WorkspaceObjective } from "@tutor-nvim/exercise-schema";
import { splitLines } from "@tutor-nvim/vim-engine";
import {
  workspaceObjectiveView,
  type WorkspaceGrepMatch,
  type WorkspaceObjectiveView,
  type WorkspaceState,
} from "@tutor-nvim/workspace-engine";

import { sameLines } from "./lines";

/*
 * End-state objectives for the simulated workspace (S1, S2). Only the end state is judged: what is
 * on screen, never which key reached it and never a strategy (AGENTS.md 13, S5). Every unmet goal
 * reports what it expected and what it found, so a screen shows which goal failed instead of
 * "wrong".
 *
 * `state` is the workspace state as the engine prints it (`WorkspaceObjectiveView`, the projection
 * `workspaceObjectiveView` returns): files, every open buffer's text, the active path, the layout
 * string, the focus index, the split ratios and the rows the last project search recorded. The type
 * comes from the engine that owns the tree, so there is one declaration of "what shape is this" and
 * one implementation of how it prints (T4; T3 kept a structural copy because it added no
 * dependency).
 */

export interface WorkspaceObjectiveEvaluation {
  readonly met: boolean;
  /** One message per unmet goal: expected versus found, in the order the goals were declared. */
  readonly failures: readonly string[];
}

/** Ratios are floats, so a split is the one content asked for within a hundredth of it. */
const RATIO_TOLERANCE = 0.01;

/**
 * A hundredth is the bound itself, never a rounding step: `Math.round` would accept 0.514 for 0.50,
 * which is further than one resize step away. The epsilon absorbs binary floating point
 * (`0.55 - 0.54` is `0.010000000000000009`), so a learner who resized once does not fail their own
 * exercise, but nothing further passes.
 */
const sameRatio = (expected: number, found: number): boolean =>
  Math.abs(expected - found) <= RATIO_TOLERANCE + Number.EPSILON;

/** Quotes a path or a text so a failure message shows exactly what was compared. */
const quoted = (value: string): string => JSON.stringify(value);

const quotedList = (values: readonly string[]): string => JSON.stringify(values);

/** The same paths in any order: `open_buffers` is a set, the order they were opened is not a goal. */
/** The same values in the same order: pre-order is the fact a swap changes. */
const sameList = (expected: readonly string[], found: readonly string[]): boolean =>
  expected.length === found.length && expected.every((value, index) => value === found[index]);

const samePaths = (expected: readonly string[], found: readonly string[]): boolean =>
  expected.length === found.length && expected.every((path) => found.includes(path));

/** The same rows in the same order: a project search answers in path order, so order is a goal. */
const sameRows = (
  expected: readonly WorkspaceGrepMatch[],
  found: readonly WorkspaceGrepMatch[],
): boolean =>
  expected.length === found.length &&
  expected.every((row, index) => {
    const other = found[index];
    return (
      other !== undefined &&
      row.path === other.path &&
      row.line === other.line &&
      row.text === other.text
    );
  });

/** The rows as a failure prints them, so the reader sees exactly which row was searched for. */
const rowsText = (rows: readonly WorkspaceGrepMatch[]): string =>
  JSON.stringify(rows.map((row) => ({ path: row.path, line: row.line, text: row.text })));

export function evaluateWorkspaceObjective(
  objective: WorkspaceObjective,
  state: WorkspaceObjectiveView,
): WorkspaceObjectiveEvaluation {
  switch (objective.type) {
    case "active_file": {
      const found = state.activePath;
      if (found === objective.path) return { met: true, failures: [] };
      return {
        met: false,
        failures: [
          `active_file: expected ${quoted(objective.path)}, found ${
            found === undefined ? "no active file" : quoted(found)
          }`,
        ],
      };
    }
    case "open_buffers": {
      const found = state.buffers.map((buffer) => buffer.path);
      if (samePaths(objective.paths, found)) return { met: true, failures: [] };
      return {
        met: false,
        failures: [
          `open_buffers: expected ${quotedList(objective.paths)}, found ${quotedList(found)}`,
        ],
      };
    }
    case "buffer_text": {
      const buffer = state.buffers.find((candidate) => candidate.path === objective.path);
      if (buffer === undefined) {
        return {
          met: false,
          failures: [
            `buffer_text: expected an open buffer for ${quoted(objective.path)}, found none`,
          ],
        };
      }
      if (sameLines(splitLines(buffer.text), objective.targetLines)) {
        return { met: true, failures: [] };
      }
      return {
        met: false,
        failures: [
          `buffer_text: expected ${quoted(objective.path)} to read ${quoted(
            objective.targetLines.join("\n"),
          )}, found ${quoted(buffer.text)}`,
        ],
      };
    }
    case "file_text": {
      const found = state.files[objective.path];
      if (found === undefined) {
        return {
          met: false,
          failures: [`file_text: expected ${quoted(objective.path)} on disk, found no file`],
        };
      }
      if (sameLines(splitLines(found), objective.targetLines)) return { met: true, failures: [] };
      return {
        met: false,
        failures: [
          `file_text: expected ${quoted(objective.path)} on disk to read ${quoted(
            objective.targetLines.join("\n"),
          )}, found ${quoted(found)}`,
        ],
      };
    }
    case "layout": {
      if (state.layout === objective.text) return { met: true, failures: [] };
      return {
        met: false,
        failures: [`layout: expected ${quoted(objective.text)}, found ${quoted(state.layout)}`],
      };
    }
    case "focus": {
      const found = state.focus;
      if (found === objective.leaf) return { met: true, failures: [] };
      return {
        met: false,
        failures: [
          `focus: expected leaf ${objective.leaf}, found ${
            found === undefined ? "no focused leaf" : `leaf ${found}`
          }`,
        ],
      };
    }
    case "split_ratio": {
      const found = state.splitRatios[objective.index];
      if (found === undefined) {
        return {
          met: false,
          failures: [
            `split_ratio: expected split ${objective.index} at ${objective.ratio}, found no split ${objective.index}`,
          ],
        };
      }
      if (sameRatio(objective.ratio, found)) return { met: true, failures: [] };
      return {
        met: false,
        failures: [
          `split_ratio: expected split ${objective.index} at ${objective.ratio}, found ${found}`,
        ],
      };
    }
    case "grep_matches": {
      // The rows are compared as the search recorded them, in project order: a reordering or a row
      // the story did not ask for is a different search, and both sides are printed so the failure
      // names the row that differs instead of a count.
      if (sameRows(objective.matches, state.matches)) return { met: true, failures: [] };
      return {
        met: false,
        failures: [
          `grep_matches: expected ${rowsText(objective.matches)}, found ${rowsText(state.matches)}`,
        ],
      };
    }
    case "windows": {
      // One entry per leaf, in pre-order: a split is two, and a swap is the same two pipes the other
      // way round, so this compares as a list and never as a set.
      const found = state.windowPaths;
      if (sameList(objective.paths, found)) return { met: true, failures: [] };
      return {
        met: false,
        failures: [`windows: expected ${quotedList(objective.paths)}, found ${quotedList(found)}`],
      };
    }
    case "zoom": {
      // A zoom is a note beside the tree, so the story has to name the window it leaves zoomed: the
      // layout is the same whether a learner zoomed and restored or never touched it, and only this
      // goal tells the two apart.
      const found = state.zoomedPath;
      if (found === objective.path) return { met: true, failures: [] };
      return {
        met: false,
        failures: [
          `zoom: expected ${objective.path === null ? "none" : quoted(objective.path)}, found ${
            found === null ? "none" : quoted(found)
          }`,
        ],
      };
    }
    case "all": {
      const failures = objective.goals.flatMap(
        (goal) => evaluateWorkspaceObjective(goal, state).failures,
      );
      return { met: failures.length === 0, failures };
    }
  }
}

/** Did the workspace reach a valid end state, with the per-goal detail a screen can show. */
export interface WorkspaceGoalEvaluation {
  readonly met: boolean;
  readonly objective: WorkspaceObjectiveEvaluation;
}

export function evaluateWorkspaceGoal(
  exercise: WorkspaceExercise,
  state: WorkspaceState,
): WorkspaceGoalEvaluation {
  const objective = evaluateWorkspaceObjective(exercise.objective, workspaceObjectiveView(state));
  return { met: objective.met, objective };
}
