import type { KeymapAction, KeymapLayer, KeymapSurface } from "@tutor-nvim/exercise-schema";
import type { InputEvent } from "@tutor-nvim/evaluation";
import {
  IDLE_KEYMAP_STATE,
  captureOrder,
  catalogFor,
  resolveKeymapKey,
  type KeymapCatalog,
  type KeymapState,
} from "@tutor-nvim/keymap";
import { keyInputToKeymapToken } from "../input/keymap-notation";

/**
 * What the layer rail shows, as data (keymap-layers.md S1, S5, S6). Kept pure and free of React, so
 * the owner of a key and the cost of an action can be checked without rendering anything.
 *
 * This is a label, not a gate: nothing here decides whether a keystroke is accepted. The attempt is
 * adjudicated by `@tutor-nvim/evaluation` exactly as before, and the resolver only says which layer
 * would have claimed the key.
 */

/** The action the rail falls back to when an exercise asks for none (`keymap-layers.md` L8). */
export const EXAMPLE_ACTION: KeymapAction = "window.split-side-by-side";

/** The given layers in capture order for `focus`, with the bindings each one provides. */
export function enabledCatalogs(
  layers: readonly KeymapLayer[],
  enabledIds: readonly string[],
  focus: KeymapSurface,
): readonly KeymapCatalog[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer] as const));
  const enabled = enabledIds
    .map((id) => byId.get(id))
    .filter((layer): layer is KeymapLayer => layer !== undefined);
  return catalogFor(captureOrder(enabled, focus));
}

/** One row of the cost table: what one enabled layer charges for the requested action. */
export interface CostRow {
  readonly layerId: string;
  readonly label: string;
  /** The keys to press, opener included. */
  readonly tokens: readonly string[];
  /** How many keys it costs: what the strategy classification compares. */
  readonly cost: number;
  /** True for the cheapest rows; on a tie every one of them is optimal. */
  readonly optimal: boolean;
}

/**
 * One row per enabled layer that provides `action`, in capture order, with its cheapest binding.
 * Empty when no enabled layer offers it: the UI says so instead of showing an empty table.
 */
export function costRows(
  catalogs: readonly KeymapCatalog[],
  action: KeymapAction,
): readonly CostRow[] {
  const offers = catalogs.flatMap((catalog) => {
    const matching = catalog.entries.filter((entry) => entry.binding.action === action);
    if (matching.length === 0) return [];
    const cheapest = matching.reduce((best, entry) =>
      entry.tokens.length < best.tokens.length ? entry : best,
    );
    return [
      {
        layerId: catalog.layer.id,
        label: catalog.layer.label,
        tokens: cheapest.tokens,
        cost: cheapest.tokens.length,
      },
    ];
  });
  if (offers.length === 0) return [];
  const minimum = Math.min(...offers.map((offer) => offer.cost));
  return offers.map((offer) => ({ ...offer, optimal: offer.cost === minimum }));
}

/** Which enabled layer claims the last key, and the sequence it belongs to. */
export interface KeyClaim {
  /** The layer that claims the key; `null` when no enabled layer does. */
  readonly owner: { readonly id: string; readonly label: string } | null;
  /** Keycaps of the sequence so far, in catalog notation. */
  readonly keys: readonly string[];
  /** False before the first keystroke, so the rail can wait instead of claiming nothing. */
  readonly pressed: boolean;
}

const labelOf = (catalogs: readonly KeymapCatalog[], layerId: string): string =>
  catalogs.find((catalog) => catalog.layer.id === layerId)?.layer.label ?? layerId;

/**
 * Replays the attempt's inputs through the resolver, in order, and reports the last one. Replaying
 * from the recorded events keeps the label consistent with the attempt (and with a retry) without a
 * second source of truth.
 */
export function keyClaim(
  catalogs: readonly KeymapCatalog[],
  events: readonly InputEvent[],
): KeyClaim {
  let state: KeymapState = IDLE_KEYMAP_STATE;
  let owner: KeyClaim["owner"] = null;
  let keys: readonly string[] = [];
  let pressed = false;
  for (const event of events) {
    const token = keyInputToKeymapToken(event);
    const before = state.keys;
    // A key the notation cannot express (`S-` chords) can never match a binding: it is unclaimed.
    const outcome = resolveKeymapKey(state, token ?? "", catalogs, {
      mode: event.mode === "shell" ? "normal" : event.mode,
    });
    state = outcome.state;
    pressed = true;
    if (outcome.kind === "not-accepted") {
      owner = null;
      // Keep the pending sequence visible: the key is discarded, not the history behind it.
      keys = before;
    } else {
      owner = { id: outcome.layerId, label: labelOf(catalogs, outcome.layerId) };
      keys = outcome.kind === "pending" ? outcome.state.keys : [...before, token ?? ""];
    }
  }
  return { owner, keys, pressed };
}
