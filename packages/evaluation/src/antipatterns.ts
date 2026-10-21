import type { AntiPatternId, Exercise } from "@tutor-nvim/exercise-schema";
import type { Attempt, InputEvent } from "./attempt";

/** Thresholds live in configuration, not in detectors or UI. */
export interface AntiPatternConfig {
  /** `repeated_x`: this many `x` presses in a row. */
  readonly repeatedX: { readonly minRun: number };
  /**
   * `excessive_hjkl`: at least `minPresses` hjkl presses in NORMAL mode, and more than the
   * keystrokes of the optimal solution (so the threshold follows the task).
   */
  readonly excessiveHjkl: { readonly minPresses: number };
  /** `repeated_escape`: this many Escape presses in a row. */
  readonly repeatedEscape: { readonly minRun: number };
}

export const DEFAULT_ANTI_PATTERN_CONFIG: AntiPatternConfig = {
  repeatedX: { minRun: 3 },
  excessiveHjkl: { minPresses: 4 },
  repeatedEscape: { minRun: 3 },
};

export interface AntiPatternHit {
  readonly id: AntiPatternId;
  /** Size of the offense: run length, or number of presses. */
  readonly count: number;
  /** `sequence` numbers of the input events involved, for feedback and replay. */
  readonly sequences: readonly number[];
}

export interface DetectionContext {
  readonly events: readonly InputEvent[];
  readonly optimalKeystrokes: number;
  readonly config: AntiPatternConfig;
}

type Detector = (context: DetectionContext) => AntiPatternHit | null;

const ARROWS: ReadonlySet<string> = new Set(["<Left>", "<Right>", "<Up>", "<Down>"]);
/** Movement keys that exist in INSERT mode of a real editor. */
const INSERT_MOVEMENT: ReadonlySet<string> = new Set([
  ...ARROWS,
  "<Home>",
  "<End>",
  "<PageUp>",
  "<PageDown>",
]);
const HJKL: ReadonlySet<string> = new Set(["h", "j", "k", "l"]);

/** Longest stretch of consecutive events matching `matches`, as the events of that stretch. */
function longestRun(
  events: readonly InputEvent[],
  matches: (event: InputEvent) => boolean,
): readonly InputEvent[] {
  let best: InputEvent[] = [];
  let current: InputEvent[] = [];
  for (const event of events) {
    current = matches(event) ? [...current, event] : [];
    if (current.length > best.length) best = current;
  }
  return best;
}

const hit = (id: AntiPatternId, events: readonly InputEvent[]): AntiPatternHit => ({
  id,
  count: events.length,
  sequences: events.map((event) => event.sequence),
});

/** Detector per anti-pattern id; add an entry (and an id in the schema) to extend. */
const DETECTORS: Readonly<Record<AntiPatternId, Detector>> = {
  repeated_x: ({ events, config }) => {
    const run = longestRun(events, (event) => event.mode === "normal" && event.logicalKey === "x");
    return run.length >= config.repeatedX.minRun ? hit("repeated_x", run) : null;
  },

  excessive_hjkl: ({ events, optimalKeystrokes, config }) => {
    const presses = events.filter((event) => event.mode === "normal" && HJKL.has(event.logicalKey));
    const excessive =
      presses.length >= config.excessiveHjkl.minPresses && presses.length > optimalKeystrokes;
    return excessive ? hit("excessive_hjkl", presses) : null;
  },

  arrow_keys: ({ events }) => {
    const presses = events.filter((event) => ARROWS.has(event.logicalKey));
    return presses.length > 0 ? hit("arrow_keys", presses) : null;
  },

  insert_mode_navigation: ({ events }) => {
    const presses = events.filter(
      (event) => event.mode === "insert" && INSERT_MOVEMENT.has(event.logicalKey),
    );
    return presses.length > 0 ? hit("insert_mode_navigation", presses) : null;
  },

  repeated_escape: ({ events, config }) => {
    const run = longestRun(events, (event) => event.logicalKey === "<Esc>");
    return run.length >= config.repeatedEscape.minRun ? hit("repeated_escape", run) : null;
  },
};

/** Shortest declared optimal solution: the keystroke baseline for efficiency and thresholds. */
export function optimalKeystrokes(exercise: Exercise): number {
  const optimal = exercise.solutions.filter((solution) => solution.classification === "optimal");
  const references = optimal.length > 0 ? optimal : exercise.solutions;
  return Math.min(...references.map((solution) => solution.keys.length));
}

/**
 * Anti-patterns the exercise opted into (`antiPatterns`) that the attempt shows.
 * Detection never blocks completion; it only informs strategy and feedback.
 */
export function detectAntiPatterns(
  exercise: Exercise,
  attempt: Attempt,
  config: AntiPatternConfig = DEFAULT_ANTI_PATTERN_CONFIG,
): AntiPatternHit[] {
  const context: DetectionContext = {
    events: attempt.events,
    optimalKeystrokes: optimalKeystrokes(exercise),
    config,
  };
  return exercise.antiPatterns.flatMap((id) => DETECTORS[id](context) ?? []);
}
