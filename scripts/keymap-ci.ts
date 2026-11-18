/**
 * The two content-gate rules that keep the keymap catalogs and their exercises from rotting
 * (`pnpm content:ci`, keymap-layers.md T7):
 *
 * 1. every binding of every catalog resolves to itself, so no row is shadowed, duplicated or
 *    written in keys the resolver or a browser cannot read;
 * 2. every action an exercise declares is provided by at least one catalog, so an exercise cannot
 *    ask for keys that no layer offers.
 *
 * Both return the same `path: problem` strings the other content checks produce, collected instead
 * of thrown one at a time, so a single run reports everything it can. Nothing here reads the
 * learner's enabled layers: the catalogs are checked against themselves and against each other.
 */
import {
  parseKeymapKeys,
  type Exercise,
  type KeymapBinding,
  type KeymapMode,
  type LoadedKeymapLayer,
} from "@tutor-nvim/exercise-schema";
import {
  IDLE_KEYMAP_STATE,
  catalogFor,
  keymapTokenToKeyInput,
  planActionSolutions,
  resolveKeymapKey,
  type KeymapCatalog,
  type KeymapEntry,
} from "@tutor-nvim/keymap";

/** The keys to press for one binding, as a message reads them: `C-b %`. */
const keysText = (tokens: readonly string[]): string => tokens.join(" ");

/** How an action reads in a message: `window.zoom`, or `edit.delete (line)` when it has a target. */
const actionText = (binding: Pick<KeymapBinding, "action" | "target">): string =>
  binding.target === undefined ? binding.action : `${binding.action} (${binding.target})`;

/** The mode a row is pressed in: its own first one, or normal when it accepts any mode. */
const modeOf = (binding: KeymapBinding): KeymapMode => binding.modes[0] ?? "normal";

/**
 * Replays one binding's keys from rest, in the mode the row declares, and says why it does not
 * complete as itself (or `null` when it does).
 *
 * The keys are the ones the learner would actually press, opener included, so a row that a shorter
 * row shadows is caught: `C-b %` completes on its second key, and the row behind it never fires.
 */
function unreachableReason(
  entry: KeymapEntry,
  catalog: KeymapCatalog,
  mode: KeymapMode,
): string | null {
  const tokens = entry.tokens;
  if (tokens.length === 0) return "it presses no keys";

  let state = IDLE_KEYMAP_STATE;
  for (const [index, token] of tokens.entries()) {
    const pressed = keysText(tokens.slice(0, index + 1));
    const outcome = resolveKeymapKey(state, token, [catalog], { mode });

    if (outcome.kind === "not-accepted") {
      return `pressing "${pressed}" is not accepted, so the keys after it never arrive`;
    }
    if (outcome.kind === "pending") {
      state = outcome.state;
      continue;
    }
    if (index < tokens.length - 1) {
      return `pressing "${pressed}" already completes ${actionText(outcome)}, so the keys after it never arrive`;
    }
    // Last key: the sequence must complete as this very row, from this very catalog.
    if (
      outcome.layerId !== catalog.layer.id ||
      outcome.action !== entry.binding.action ||
      outcome.target !== entry.binding.target
    ) {
      return `pressing it completes ${actionText(outcome)} instead`;
    }
    return null;
  }
  return "it stays pending after its last key, so it never completes";
}

/** Why one catalog row can never be pressed, or `null` when it resolves to itself. */
function bindingProblem(entry: KeymapEntry, catalog: KeymapCatalog): string | null {
  const binding = entry.binding;
  // A row the catalog claims the simulator can exercise must be a key a browser can report:
  // `keymapTokenToKeyInput` returns null for a key the notation has no input for (a shift chord
  // arrives as the character the layout produced), so such a row could never be pressed at all.
  const modelled = binding.notModelled === undefined;
  if (modelled && entry.tokens.some((token) => keymapTokenToKeyInput(token) === null)) {
    return "the key notation cannot express every key it presses";
  }
  const reason = unreachableReason(entry, catalog, modeOf(binding));
  if (reason === null) return null;
  return reason;
}

/**
 * The opener a layer declares must be readable by the resolver, the way the schema reads it: the two
 * validators disagreeing would make every binding of the layer unreachable without a word.
 */
function openerProblems({ layer, source }: LoadedKeymapLayer): string[] {
  const problems: string[] = [];
  for (const [field, text] of [
    ["prefix", layer.prefix],
    ["leader", layer.leader],
  ] as const) {
    if (text === undefined || parseKeymapKeys(text) !== null) continue;
    problems.push(
      `${source}: layer ${layer.id} declares the ${field} "${text}", which the resolver cannot read: write it as one key sequence`,
    );
  }
  return problems;
}

/**
 * Every binding of one catalog must resolve to itself with only that layer enabled.
 *
 * `catalogFor` looks `extends` up among the layers it is given, so a layer passed on its own
 * contributes exactly the rows written in its file: the inherited set is another catalog's content
 * and is checked against its own file, not here.
 */
function checkLayer(loaded: LoadedKeymapLayer): string[] {
  const { layer, source } = loaded;
  const problems = openerProblems(loaded);
  const catalog = catalogFor([layer])[0];
  // A parsed layer always has bindings, so the catalog exists; the guard is for the type, not for
  // content.
  if (catalog === undefined) return problems;

  for (const entry of catalog.entries) {
    const reason = bindingProblem(entry, catalog);
    if (reason === null) continue;
    problems.push(
      `${source}: binding "${keysText(entry.tokens)}" -> ${actionText(entry.binding)} can never be reached: ${reason}`,
    );
  }
  return problems;
}

/** Every action an exercise declares must be provided by at least one catalog, or it cannot be solved. */
function checkActionSolutions(
  exercises: readonly Exercise[],
  catalogs: readonly KeymapCatalog[],
): string[] {
  const problems: string[] = [];
  for (const exercise of exercises) {
    for (const solution of exercise.actionSolutions) {
      if (planActionSolutions([solution], catalogs).length > 0) continue;
      problems.push(
        `${exercise.id}: declares action solution "${solution.action}"${solution.target === undefined ? "" : ` (${solution.target})`}, which no keymap catalog provides`,
      );
    }
  }
  return problems;
}

/** Both catalog rules, over every catalog and every exercise, as one list of problems. */
export function checkKeymapCatalogs(
  loaded: readonly LoadedKeymapLayer[],
  exercises: readonly Exercise[],
): string[] {
  const catalogs = catalogFor(loaded.map((item) => item.layer));
  return [...loaded.flatMap(checkLayer), ...checkActionSolutions(exercises, catalogs)];
}
