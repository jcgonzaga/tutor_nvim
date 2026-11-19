import { z } from "zod";

import { KEYMAP_ACTIONS, KEYMAP_TARGETS, KEYMAP_TARGETED_ACTIONS } from "./keymap-vocabulary";
import { SOLUTION_CLASSIFICATIONS } from "./primitives";

/**
 * A solution written as what the learner must accomplish, not as one tool's keys (S6).
 *
 * tmux, Herdr, Omarchy's tmux and Neovim all split a pane, with different keys and a different
 * cost. Naming the action lets any enabled layer that provides it solve the exercise, and lets the
 * strategy classification compare what each layer's keys cost. The concrete keys are derived from
 * the enabled catalogs (`packages/keymap`), never written here: one copy per tool is what this field
 * exists to avoid.
 *
 * One action: its name, plus what the operator acts on when the verb takes a text object (`di"` and
 * `dap` stay one action instead of one action each).
 */
export const actionRefSchema = z
  .strictObject({
    action: z.enum(KEYMAP_ACTIONS),
    /** What an operator acts on; only the editing verbs take one (see `KEYMAP_TARGETED_ACTIONS`). */
    target: z.enum(KEYMAP_TARGETS).optional(),
  })
  .superRefine((solution, ctx) => {
    if ((KEYMAP_TARGETED_ACTIONS as readonly string[]).includes(solution.action)) return;
    if (solution.target === undefined) return;
    ctx.addIssue({
      code: "custom",
      path: ["target"],
      message: `"${solution.action}" takes no target: only ${KEYMAP_TARGETED_ACTIONS.join(", ")} do`,
    });
  });

export type ActionRef = z.output<typeof actionRefSchema>;

/** An action with the classification the learner (or CI) reports for it. */
export const actionSolutionSchema = actionRefSchema.extend({
  classification: z.enum(SOLUTION_CLASSIFICATIONS),
});

export type ActionSolution = z.output<typeof actionSolutionSchema>;

/** The action solutions of one exercise, parsed; rejects the same action declared twice. */
export const actionSolutionsSchema = z
  .array(actionSolutionSchema)
  .max(50)
  .default([])
  .refine(
    (solutions) =>
      new Set(solutions.map((solution) => `${solution.action}\u0000${solution.target ?? ""}`))
        .size === solutions.length,
    "declares the same action twice: one line per action, whatever the layer",
  );
