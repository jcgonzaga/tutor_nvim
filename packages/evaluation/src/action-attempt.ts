import type { ActionSolution, KeymapAction } from "@tutor-nvim/exercise-schema";
import {
  keyInputToKeymapToken,
  planActionSolutions,
  traceKeymapActions,
  type KeymapCatalog,
  type NotedInput,
} from "@tutor-nvim/keymap";
import type { VimMode } from "@tutor-nvim/vim-engine";

import {
  DEFAULT_STRATEGY_CONFIG,
  efficiencyClassification,
  type StrategyClassification,
  type StrategyConfig,
} from "./strategy";

/**
 * The action half of S6: an exercise asks for an action and an end state, so any enabled layer that
 * provides the action solves it, and the strategy compares what the keys cost.
 *
 * The keys are never written in the exercise: they come from the enabled catalogs
 * (`@tutor-nvim/keymap`), which is what lets tmux's `C-b %`, Herdr's `C-b v` and Neovim's `C-w v`
 * all solve the same line. This decides only the action: the end state stays `goalMet`'s question,
 * and `evaluateAttempt` keeps deciding it for exercises that declare key solutions.
 */

/** The part of a recorded input this reads; an attempt's `InputEvent` carries all of it. */
export interface RecordedInput extends NotedInput {
  /** The mode the key arrived in; a shell input is resolved as NORMAL, as the layer rail does. */
  readonly mode?: VimMode | "shell" | undefined;
}

/** One declared action the attempt performed, with the layer that provided it and its cost. */
export interface PerformedAction {
  /** The exercise's declared solution this answers. */
  readonly solution: ActionSolution;
  readonly layerId: string;
  /** The layer the binding was written in, which inheritance can make different from `layerId`. */
  readonly sourceId: string;
  readonly action: KeymapAction;
  readonly target: ActionSolution["target"];
  /** The keys the layer charged, opener included (`C-b`, `%`). */
  readonly keys: readonly string[];
  /** Their count: what the layer charges for the action. */
  readonly cost: number;
  /** Index of the first recorded input it consumed. */
  readonly eventIndex: number;
}

export interface ActionAttempt {
  readonly kind: "action";
  /** True when the attempt performed one of the declared actions. */
  readonly success: boolean;
  /** Every declared action it performed, in the order it performed them. */
  readonly performed: readonly PerformedAction[];
  /** The first one: which layer did it and the keys it cost; `null` when nothing was performed. */
  readonly solvedBy: PerformedAction | null;
  /** The attempt's whole cost in keystrokes, so a wasted key still lowers the classification. */
  readonly keystrokes: number;
  /** The cheapest cost any enabled layer charges for the performed action; `null` if none. */
  readonly cheapestCost: number | null;
  readonly classification: StrategyClassification;
}

export type ActionAttemptEvaluation =
  /** The exercise declares no action: this decides nothing about it, it is not a failure. */
  | { readonly kind: "not-an-action-exercise" }
  | ActionAttempt;

/** The exercise's declaration, or nothing: an exercise that names no action is not judged here. */
export interface DeclaredActions {
  readonly actionSolutions?: readonly ActionSolution[] | undefined;
}

const modeOf = (input: RecordedInput): VimMode =>
  input.mode === undefined || input.mode === "shell" ? "normal" : input.mode;

/** Whether a declared solution is what a traced action answers (an absent target takes any). */
const answers = (
  solution: ActionSolution,
  action: KeymapAction,
  target: ActionSolution["target"],
): boolean =>
  solution.action === action && (solution.target === undefined || solution.target === target);

/**
 * Decides an attempt against the exercise's declared action solutions.
 *
 * The recorded inputs are replayed through the resolver's own notation (`keyInputToKeymapToken`)
 * and resolution (`traceKeymapActions`), so a key no enabled layer claims completes no action and
 * merely costs a keystroke. The classification then compares that cost with the cheapest layer that
 * provides the action, using the existing efficiency bands.
 */
export function evaluateActionAttempt(
  exercise: DeclaredActions,
  events: readonly RecordedInput[],
  catalogs: readonly KeymapCatalog[],
  config: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
): ActionAttemptEvaluation {
  const solutions = exercise.actionSolutions ?? [];
  if (solutions.length === 0) return { kind: "not-an-action-exercise" };

  const trace = traceKeymapActions(
    events.map((event) => keyInputToKeymapToken(event) ?? ""),
    catalogs,
    { modeAt: (tokenIndex) => modeOf(events[tokenIndex] ?? { key: "" }) },
  );

  const performed = trace.actions.flatMap((traced) => {
    const solution = solutions.find((candidate) =>
      answers(candidate, traced.action, traced.target),
    );
    if (solution === undefined) return [];
    return [
      {
        solution,
        layerId: traced.layerId,
        sourceId: traced.sourceId,
        action: traced.action,
        target: traced.target,
        keys: traced.keys,
        cost: traced.cost,
        eventIndex: traced.tokenIndex,
      },
    ];
  });

  const solvedBy = performed[0] ?? null;
  const cheapestCost =
    solvedBy === null ? null : (planActionSolutions([solvedBy.solution], catalogs)[0]?.cost ?? null);
  const classification: StrategyClassification =
    solvedBy === null || cheapestCost === null
      ? "failed"
      : efficiencyClassification(cheapestCost, events.length, config.efficiencyBands);

  return {
    kind: "action",
    success: solvedBy !== null,
    performed,
    solvedBy,
    keystrokes: events.length,
    cheapestCost,
    classification,
  };
}
