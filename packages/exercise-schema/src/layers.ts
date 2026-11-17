import type { Exercise } from "./validate";

/**
 * Which exercises a learner can practice, given the tool layers they enabled (S1, S4).
 *
 * An exercise declares `environment.layers`: the tools whose keymaps it can be solved with. It stays
 * available only while *every* one of them is enabled; with none declared it is always available.
 * Disabling a layer therefore hides its exercises instead of offering one that cannot be solved.
 * Kept free of React and of any storage: the caller owns the learner's choice.
 */
export const exerciseLayers = (exercise: Exercise): readonly string[] => exercise.environment.layers;

export function isExerciseAvailable(
  exercise: Exercise,
  enabledLayers: ReadonlySet<string>,
): boolean {
  return exercise.environment.layers.every((layer) => enabledLayers.has(layer));
}

/** The exercises available with `enabledLayers`, in the order they were given. */
export function availableExercises<T extends Exercise>(
  exercises: readonly T[],
  enabledLayers: ReadonlySet<string>,
): readonly T[] {
  return exercises.filter((exercise) => isExerciseAvailable(exercise, enabledLayers));
}
