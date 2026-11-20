import type { Page } from "@playwright/test";
import {
  captureOrder,
  catalogFor,
  keymapTokenToKeyInput,
  planActionSolutions,
  type KeymapCatalog,
} from "@tutor-nvim/keymap";
import {
  parseKeymapLayers,
  type KeymapLayer,
  type WorkspaceExercise,
  type WorkspaceSolutionAction,
} from "@tutor-nvim/exercise-schema";
import { readKeymapInput } from "../../scripts/content-fs";

/**
 * Driving a workspace exercise from the browser suite (T8, S7).
 *
 * A workspace solution is a list of actions, not a list of keys: `file.open` says what has to happen
 * and the learner's tool layers say which keys do it. This module answers the one question the suite
 * needs — "can a learner press this solution?" — with the same content and the same planner the
 * practice area uses: `content/keymaps`, parsed and extended by `@tutor-nvim/keymap`, and
 * `planActionSolutions` for the cheapest binding of one action. It presses nothing itself beyond
 * those keys, so a solution it cannot press is reported, never approximated.
 *
 * An action has no pressable form for one of these reasons, and each is reported with the action:
 *
 * 1. No enabled layer offers it. A layer that is off claims no keys, and no key means no press.
 * 2. It carries a target — a path, a text, a query, a command, a tab. A catalog binding names the
 *    action and never its options, and `WorkspacePractice` hands the engine the action alone, so the
 *    engine would refuse the press with "no path given" instead of reaching the story's goal.
 * 3. The keys themselves cannot be pressed by a page (`S-` chords arrive as the character the layout
 *    produced, so there is no key to compare): `keymapTokenToKeyInput` is the repository's own answer
 *    to "can a page see this key", the rule `scripts/keymap-ci.ts` holds every modelled row to.
 *
 * `notModelled` is deliberately not a filter here. It is the catalog telling a *reader* that the real
 * desktop never delivers that chord (`Super-Enter`, tmux without a multiplexer engine); the resolver
 * the practice area actually runs does not read it, so the suite presses what the screen resolves and
 * says nothing it cannot see. `odd/tasks/workspace-user-stories.md` records the same distinction,
 * and the workspace rows that are stale now that `packages/workspace-engine` exists are content's to
 * update, not this helper's to guess.
 */

/**
 * The catalogs are content, read the way `apps/web/src/keymaps.ts` reads them: same directory, same
 * sort, same validator, so a broken catalog fails here as loudly as it fails at startup.
 */
const layers: readonly KeymapLayer[] = parseKeymapLayers(
  [...readKeymapInput()].sort((left, right) => left.path.localeCompare(right.path)),
);

/** The fields of a solution action a key press cannot say: everything except the action and its target. */
const TARGET_FIELDS = ["path", "text", "query", "command", "tab"] as const;

/** What the suite can do with the declaration: press it, or say why nobody can. */
export type WorkspacePlan =
  | { readonly kind: "pressable"; readonly keys: readonly string[] }
  | { readonly kind: "unpressable"; readonly action: string; readonly reason: string };

/** The value an action carries besides its name, as the helper quotes it back, or `null`. */
function carriedTarget(action: WorkspaceSolutionAction): string | null {
  for (const field of TARGET_FIELDS) {
    const value = action[field];
    if (value !== undefined) return `${field} ${JSON.stringify(value)}`;
  }
  return null;
}

/**
 * The keys a learner would press for the declared optimal solution, or the first action none can
 * press and why.
 *
 * Every workspace story starts on a file window, so the catalogs are ordered for the editor surface;
 * a story that moves the keys to a terminal does so through an action (`app.launch-terminal`), not
 * through a key, so the order the press starts under is the order it keeps. Where two enabled layers
 * compete for the same key the cheapest binding wins and ties keep capture order, exactly as
 * `planActionSolutions` sorts them (`keymap-layers.md` S6).
 */
export function planWorkspaceSolution(
  exercise: WorkspaceExercise,
  enabledLayers: readonly string[],
): WorkspacePlan {
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  if (optimal === undefined) {
    return {
      kind: "unpressable",
      action: exercise.slug,
      reason: "it declares no optimal solution",
    };
  }
  const catalogs: readonly KeymapCatalog[] = catalogFor(
    captureOrder(
      layers.filter((layer) => enabledLayers.includes(layer.id)),
      "editor",
    ),
  );
  const keys: string[] = [];
  for (const action of optimal.actions) {
    const target = carriedTarget(action);
    if (target !== null) {
      return {
        kind: "unpressable",
        action: action.action,
        reason: `${action.action} carries its ${target}, and a catalog binding names the action and never its options: the practice area sends the action alone, so the engine would refuse the press`,
      };
    }
    const reachable = planActionSolutions(
      [{ action: action.action, classification: "optimal" }],
      catalogs,
    ).find((candidate) => candidate.keys.every((token) => keymapTokenToKeyInput(token) !== null));
    if (reachable === undefined) {
      return {
        kind: "unpressable",
        action: action.action,
        reason:
          enabledLayers.length === 0
            ? "the learner has no tool layer on, so no key claims it"
            : `none of the layers on (${enabledLayers.join(", ")}) offers it as a key a page can report`,
      };
    }
    keys.push(...reachable.keys);
  }
  return { kind: "pressable", keys };
}

/** Catalog names for keys a browser calls something else. */
const PAGE_KEYS: Readonly<Record<string, string>> = { " ": "Space" };

/**
 * Presses catalog tokens (`C-w`, `Super-Enter`, `%`, `Enter`) in the practice area, one key at a
 * time, the way the resolver expects to receive them: the modifiers are held while the key is typed,
 * so `C-w+` presses `+` with Ctrl instead of being read as a chord and a stray one.
 *
 * A token the notation cannot express is an error and not a skipped key: the caller has already
 * refused to press such a solution, so reaching this line with one would mean the plan lied.
 */
export async function pressKeymapTokens(page: Page, tokens: readonly string[]): Promise<void> {
  for (const token of tokens) {
    const input = keymapTokenToKeyInput(token);
    if (input === null) throw new Error(`the catalog key "${token}" has no key a page can report`);
    const modifiers = [
      ...(input.ctrl ? ["Control"] : []),
      ...(input.alt ? ["Alt"] : []),
      ...(input.meta ? ["Meta"] : []),
    ];
    for (const modifier of modifiers) await page.keyboard.down(modifier);
    try {
      if ([...input.key].length === 1) await page.keyboard.type(input.key);
      else await page.keyboard.press(PAGE_KEYS[input.key] ?? input.key);
    } finally {
      for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
    }
  }
}
