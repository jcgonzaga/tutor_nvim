import type { WorkspaceObjective } from "@tutor-nvim/exercise-schema";
import { splitLines } from "@tutor-nvim/vim-engine";

import { sameLines } from "./goal";

/*
 * End-state objectives for the simulated workspace (S1, S2). Only the end state is judged: what is
 * on screen, never which key reached it and never a strategy (AGENTS.md 13, S5). Every unmet goal
 * reports what it expected and what it found, so a screen shows which goal failed instead of
 * "wrong".
 *
 * `state` is the workspace state as the engine prints it (`workspaceObjectiveView` in
 * `@tutor-nvim/workspace-engine`): files, every open buffer's text, the active path, the layout
 * string, the focus index and the split ratios. Taking that projection instead of importing the
 * engine is what keeps one implementation of "what shape is this" — the printers live in the engine
 * that owns the tree — while this package needs no new dependency to compare the objective (T3
 * adds none; T4 can import the engine once evaluation replays action solutions).
 */

/** The projection above, declared structurally on the consumer side so no import is needed. */
export interface WorkspaceObjectiveState {
  readonly files: Readonly<Record<string, string>>;
  readonly buffers: readonly { readonly path: string; readonly text: string }[];
  readonly activePath: string | undefined;
  readonly layout: string;
  readonly focus: number | undefined;
  readonly splitRatios: readonly number[];
}

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
const samePaths = (expected: readonly string[], found: readonly string[]): boolean =>
  expected.length === found.length && expected.every((path) => found.includes(path));

export function evaluateWorkspaceObjective(
  objective: WorkspaceObjective,
  state: WorkspaceObjectiveState,
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
    case "all": {
      const failures = objective.goals.flatMap(
        (goal) => evaluateWorkspaceObjective(goal, state).failures,
      );
      return { met: failures.length === 0, failures };
    }
  }
}
