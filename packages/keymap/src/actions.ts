import type { ActionSolution, Exercise, KeymapAction } from "@tutor-nvim/exercise-schema";

import type { KeymapCatalog } from "./resolve";

/**
 * An action solution turned into the concrete keys one enabled layer offers for it (S6).
 *
 * tmux, Herdr, LazyVim and Neovim all split a pane with different keys, and a prefix or a leader
 * makes them cost differently. The exercise names the action once; this is where a layer's own
 * keys stand in for it, and where the cost the strategy classification compares comes from.
 */
export interface PlannedActionSolution {
  readonly action: KeymapAction;
  readonly target: ActionSolution["target"];
  readonly classification: ActionSolution["classification"];
  /** The enabled layer whose keys do it. */
  readonly layerId: string;
  /** The layer the binding was written in, which inheritance can make different from `layerId`. */
  readonly sourceId: string;
  readonly keys: readonly string[];
  /** What the keys cost: their count, the same unit the strategy rule divides by. */
  readonly cost: number;
}

const provides = (catalog: KeymapCatalog, solution: ActionSolution) =>
  catalog.entries.filter(
    (entry) =>
      entry.binding.action === solution.action &&
      (solution.target === undefined || entry.binding.target === solution.target),
  );

/**
 * Every way the enabled layers solve one declared action, cheapest first; ties keep capture order.
 * A layer that does not provide the action contributes nothing, and a solution no enabled layer
 * provides yields no candidate at all, so a caller can say so instead of offering a dead exercise.
 */
export function planActionSolutions(
  solutions: readonly ActionSolution[],
  catalogs: readonly KeymapCatalog[],
): readonly PlannedActionSolution[] {
  const planned = solutions.flatMap((solution) =>
    catalogs.flatMap((catalog) =>
      provides(catalog, solution).map((entry) => ({
        action: solution.action,
        target: solution.target,
        classification: solution.classification,
        layerId: catalog.layer.id,
        sourceId: entry.sourceId,
        keys: entry.tokens,
        cost: entry.tokens.length,
      })),
    ),
  );
  // Cheapest first; Array.prototype.sort is stable, so equal costs keep capture order.
  return [...planned].sort((left, right) => left.cost - right.cost);
}

/** The action solutions an exercise declares, planned over the enabled layers. */
export const planExerciseActions = (
  exercise: Pick<Exercise, "actionSolutions">,
  catalogs: readonly KeymapCatalog[],
): readonly PlannedActionSolution[] => planActionSolutions(exercise.actionSolutions, catalogs);

/** The cheapest way any enabled layer solves the action, or nothing when none does. */
export const cheapestAction = (
  action: KeymapAction,
  catalogs: readonly KeymapCatalog[],
): PlannedActionSolution | undefined =>
  planActionSolutions([{ action, classification: "optimal" }], catalogs)[0];
