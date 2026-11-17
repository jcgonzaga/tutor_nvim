import type {
  KeymapBinding,
  KeymapLayer,
  KeymapMode,
  KeymapSurface,
} from "@tutor-nvim/exercise-schema";
import { parseKeymapKeys } from "@tutor-nvim/exercise-schema";

/**
 * Which action a key press means, given the tool layers the learner enabled (S5).
 *
 * Keys are not interpreted per tool: every layer is a catalog of `binding.keys -> action`, and the
 * same key can mean different things in different tools. Resolution therefore answers two questions
 * in one pure step: which enabled layer claims this key, and which action does it give.
 *
 * Capture order is the focused surface first, then outward (`captureOrder`). Prefixes and leaders are
 * openers: a layer's bindings are pressed after them, so a sequence is `<prefix> <leader> <keys>`,
 * and a layer's inherited bindings keep the opener of the layer they came from, so nvim's `h` stays
 * one key inside the LazyVim layer.
 */

/** One binding with the sequence that triggers it, prefix and leader already prepended. */
export interface KeymapEntry {
  /** The layer the binding comes from, which is not always the enabled layer (inheritance). */
  readonly sourceId: string;
  readonly binding: KeymapBinding;
  /** Every key to press, in order, opener included. */
  readonly tokens: readonly string[];
}

/** An enabled layer with the bindings it provides, its own and the ones it inherits. */
export interface KeymapCatalog {
  readonly layer: KeymapLayer;
  readonly entries: readonly KeymapEntry[];
}

/** Nothing pressed yet: the next key starts a fresh sequence. */
export interface KeymapState {
  /** The enabled layer whose prefix or leader is open; null at rest. */
  readonly layerId: string | null;
  /** The keys pressed since that layer opened, its opener first. */
  readonly keys: readonly string[];
}

export const IDLE_KEYMAP_STATE: KeymapState = { layerId: null, keys: [] };

export type KeymapOutcome =
  | {
      /** The keys so far could still become a binding: keep the layer open. */
      readonly kind: "pending";
      readonly state: KeymapState;
      readonly layerId: string;
    }
  | {
      readonly kind: "action";
      readonly state: KeymapState;
      readonly layerId: string;
      readonly sourceId: string;
      readonly action: KeymapBinding["action"];
      readonly target: KeymapBinding["target"];
      readonly binding: KeymapBinding;
    }
  | {
      /** No enabled layer claims this key as pressed: the UI says so instead of dropping it. */
      readonly kind: "not-accepted";
      readonly state: KeymapState;
      readonly key: string;
    };

export interface ResolveOptions {
  readonly mode?: KeymapMode;
}

/**
 * A layer's opener in front of every binding it owns: its prefix first, then its leader.
 *
 * The two are not the same kind of thing. A prefix is one setting of the running tool, so a layer
 * that changes it (Omarchy ships tmux with `C-Space`) changes it for the inherited bindings too.
 * A leader only opens the bindings the layer declaring it maps itself: Neovim's `h` stays one key
 * inside LazyVim.
 */
/** `(keys, modes)` identifies a binding across layers: the pair an override replaces. */
const bindingKey = (binding: KeymapBinding): string =>
  [binding.keys, [...binding.modes].sort().join(",")].join("\u0000");

const keysOf = (text: string | undefined): readonly string[] =>
  text === undefined ? [] : (parseKeymapKeys(text) ?? []);

/**
 * The bindings one layer provides: its own, then everything it extends. A nearer layer wins, so an
 * inherited binding is dropped only when a layer below it declares the same `(keys, modes)` pair.
 */
function entriesFor(
  layer: KeymapLayer,
  byId: ReadonlyMap<string, KeymapLayer>,
  seen: ReadonlySet<string> = new Set(),
  inheritedPrefix?: readonly string[],
): readonly KeymapEntry[] {
  // A prefix passed down from a nearer layer wins: it is the setting the running tool actually has.
  const prefix = inheritedPrefix ?? keysOf(layer.prefix);
  const leader = keysOf(layer.leader);
  const opener = [...prefix, ...leader];
  const own = layer.bindings.map((binding) => ({
    sourceId: layer.id,
    binding,
    tokens: [...opener, ...keysOf(binding.keys)],
  }));
  const claimed = new Set(layer.bindings.map(bindingKey));
  const inherited: KeymapEntry[] = [];
  for (const parentId of layer.extends) {
    const parent = byId.get(parentId);
    // An unknown parent or a cycle is a content error the set validator already reports.
    if (parent === undefined || seen.has(parentId)) continue;
    const parentPrefix = prefix;
    for (const entry of entriesFor(parent, byId, new Set([...seen, layer.id]), parentPrefix)) {
      if (claimed.has(bindingKey(entry.binding))) continue;
      inherited.push(entry);
    }
  }
  return [...own, ...inherited];
}
/** Every enabled layer as a catalog, extended layers included, in the order they were given. */
export function catalogFor(layers: readonly KeymapLayer[]): readonly KeymapCatalog[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer] as const));
  return layers.map((layer) => ({ layer, entries: entriesFor(layer, byId) }));
}

/**
 * The enabled layers in capture order: the ones owning the focused surface first, then the rest
 * outward. Ties keep the order the learner enabled them in, the only stable rule when two layers own
 * the same surface (tmux and Herdr both own the multiplexer).
 */
export function captureOrder(
  layers: readonly KeymapLayer[],
  focus: KeymapSurface,
): readonly KeymapLayer[] {
  return [
    ...layers.filter((layer) => layer.owns.includes(focus)),
    ...layers.filter((layer) => !layer.owns.includes(focus)),
  ];
}

const startsWith = (tokens: readonly string[], keys: readonly string[]): boolean =>
  keys.length <= tokens.length && keys.every((key, index) => tokens[index] === key);

const modeAllows = (binding: KeymapBinding, mode: KeymapMode): boolean =>
  binding.modes.length === 0 || binding.modes.includes(mode);

const completed = (entry: KeymapEntry, layerId: string): KeymapOutcome => ({
  kind: "action",
  state: IDLE_KEYMAP_STATE,
  layerId,
  sourceId: entry.sourceId,
  action: entry.binding.action,
  target: entry.binding.target,
  binding: entry.binding,
});

/** Resolves one key press, in the state the previous one left. Pure: the caller keeps the state. */
export function resolveKeymapKey(
  state: KeymapState,
  key: string,
  catalogs: readonly KeymapCatalog[],
  options: ResolveOptions = {},
): KeymapOutcome {
  const mode = options.mode ?? "normal";
  if (state.layerId === null) {
    for (const catalog of catalogs) {
      for (const entry of catalog.entries) {
        if (!modeAllows(entry.binding, mode) || entry.tokens[0] !== key) continue;
        if (entry.tokens.length === 1) return completed(entry, catalog.layer.id);
        const layerId = catalog.layer.id;
        return { kind: "pending", state: { layerId, keys: [key] }, layerId };
      }
    }
    return { kind: "not-accepted", state: IDLE_KEYMAP_STATE, key };
  }

  const catalog = catalogs.find((item) => item.layer.id === state.layerId);
  // The layer that was open is gone (the learner disabled it): the key is simply not accepted.
  if (catalog === undefined) return { kind: "not-accepted", state: IDLE_KEYMAP_STATE, key };

  const keys = [...state.keys, key];
  const open = catalog.entries.filter(
    (entry) => modeAllows(entry.binding, mode) && startsWith(entry.tokens, keys),
  );
  const exact = open.find((entry) => entry.tokens.length === keys.length);
  if (exact !== undefined) return completed(exact, catalog.layer.id);
  if (open.length > 0) {
    const layerId = state.layerId;
    return { kind: "pending", state: { layerId, keys }, layerId };
  }
  return { kind: "not-accepted", state: IDLE_KEYMAP_STATE, key };
}

/** The keys pressed so far, for the UI to render as keycaps. Empty at rest. */
export const pendingKeys = (state: KeymapState): readonly string[] => state.keys;
