import { dispatch, keyInputFromToken, type Position, type VimMode } from "@tutor-nvim/vim-engine";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { startAttempt, type Attempt } from "./attempt";

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
  exercise: Exercise,
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
  state: ReturnType<typeof startAttempt>["state"],
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

/** The shortest declared optimal solution as a run (no timing: nobody typed it). */
export function masterRun(exercise: Exercise): { keys: readonly string[] } | null {
  const optimal = exercise.solutions
    .filter((solution) => solution.classification === "optimal")
    .sort((a, b) => a.keys.length - b.keys.length)[0];
  return optimal ? { keys: optimal.keys } : null;
}

export interface RunSummary {
  readonly label: "YOU" | "MASTER" | "YOUR BEST";
  /** The keys as one string: `hhhhwwci"`. */
  readonly keys: string;
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
      keys: master.keys.join(""),
      keystrokes: master.keys.length,
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
