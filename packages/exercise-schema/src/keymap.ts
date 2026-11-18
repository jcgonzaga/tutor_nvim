import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  KEYMAP_ACTIONS,
  KEYMAP_MODES,
  KEYMAP_SCHEMA_VERSION,
  KEYMAP_SURFACES,
  KEYMAP_TARGETED_ACTIONS,
  KEYMAP_TARGETS,
  type KeymapSurface,
} from "./keymap-vocabulary";
import { ExerciseValidationError, formatIssues } from "./validate";

export * from "./keymap-vocabulary";
/** Keys spelled as a name instead of a character, because the character is not printable. */
export const KEYMAP_NAMED_KEYS = [
  "Enter",
  "Esc",
  "Space",
  "Tab",
  "Left",
  "Right",
  "Up",
  "Down",
] as const;

const isPrintable = (text: string): boolean => text.length === 1 && text >= " " && text <= "~";

/** Reads one base key at the start of `text`: a named key (greedy) or a single printable character. */
function baseKeyLength(text: string): number {
  const named = (KEYMAP_NAMED_KEYS as readonly string[]).find((name) => text.startsWith(name));
  if (named !== undefined) return named.length;
  return isPrintable(text.slice(0, 1)) ? 1 : 0;
}

/**
 * Splits a layer key string into the keys it presses: `%` is one key, `ff` is two, `C-M-x` is one
 * chord. Returns `null` when the text is not in the notation, so authors get one message either
 * way. A layer with a leader writes its bindings after it, so `ff` means `<leader>ff` (S2).
 */
export function parseKeymapKeys(text: string): readonly string[] | null {
  const tokens: string[] = [];
  let index = 0;
  while (index < text.length) {
    let cursor = index;
    // Any number of modifiers, each written `C-`, `S-`, `M-` or `Super-`.
    for (;;) {
      const modifier = /^(?:C|S|M|Super)[-+]/.exec(text.slice(cursor));
      if (modifier === null) break;
      cursor += modifier[0].length;
    }
    const base = baseKeyLength(text.slice(cursor));
    if (base === 0) return null;
    tokens.push(text.slice(index, cursor + base));
    index = cursor + base;
  }
  return tokens.length === 0 ? null : tokens;
}

/** `prefix` and `leader` hold one key or a run of keys, space-separated when it is more than one. */
export function isKeymapKeySequence(text: string): boolean {
  if (parseKeymapKeys(text) !== null) return true;
  const tokens = text.trim().split(/\s+/);
  return tokens.length > 1 && tokens.every((token) => parseKeymapKeys(token) !== null);
}

const keySchema = z.string().superRefine((value, ctx) => {
  if (parseKeymapKeys(value) !== null) return;
  ctx.addIssue({
    code: "custom",
    message: `"${value}" is not written in the key notation: use a printable character, a named key (${KEYMAP_NAMED_KEYS.join(", ")}) or modifiers (C-, S-, M-, Super-) joined to one, one after another for each key`,
  });
});

const keySequenceSchema = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    if (isKeymapKeySequence(value)) return;
    ctx.addIssue({
      code: "custom",
      message: `"${value}" is not a key sequence: space-separate keys written in the binding notation`,
    });
  });

/** Layer ids are stable public identifiers: `linux`, `nvim`, `lazyvim`, `tmux`. */
const keymapIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'must be lowercase letters, digits and "-", starting with a letter');

/**
 * One keys → action line of a catalog. `override` must be true to replace an inherited
 * `(keys, modes)` pair; `target` refines an operator action with the text object it applies to;
 * `notModelled` records a binding the simulator cannot exercise yet, so the catalog stays honest
 * instead of pretending.
 */
export const keymapBindingSchema = z
  .strictObject({
    keys: keySchema,
    action: z.enum(KEYMAP_ACTIONS),
    /** What the operator acts on; only the editing verbs take one (see `KEYMAP_TARGETED_ACTIONS`). */
    target: z.enum(KEYMAP_TARGETS).optional(),
    description: z.string().min(1),
    modes: z.array(z.enum(KEYMAP_MODES)).default([]),
    override: z.boolean().default(false),
    notModelled: z.string().min(1).optional(),
  })
  .superRefine((binding, ctx) => {
    if (binding.target === undefined) return;
    if ((KEYMAP_TARGETED_ACTIONS as readonly string[]).includes(binding.action)) return;
    ctx.addIssue({
      code: "custom",
      path: ["target"],
      message: `"${binding.action}" takes no target: only ${KEYMAP_TARGETED_ACTIONS.join(", ")} do`,
    });
  });

export type KeymapBinding = z.output<typeof keymapBindingSchema>;
export type KeymapBindingInput = z.input<typeof keymapBindingSchema>;

/** One tool's keymap layer: the content form of "these keys mean these actions on this surface". */
export const keymapLayerSchema = z
  .strictObject({
    schemaVersion: z.literal(KEYMAP_SCHEMA_VERSION, {
      message: `must be ${KEYMAP_SCHEMA_VERSION}`,
    }),
    id: keymapIdSchema,
    label: z.string().min(1),
    owns: z.array(z.enum(KEYMAP_SURFACES)).min(1),
    /** Layer ids this one builds on; enabling it adds to them instead of replacing them (S3). */
    extends: z.array(keymapIdSchema).default([]),
    /** The key(s) that open this layer's command group, e.g. tmux's `C-b`. */
    prefix: keySequenceSchema.optional(),
    /** The leader this layer's bindings are written after, e.g. LazyVim's space. */
    leader: keySequenceSchema.optional(),
    bindings: z.array(keymapBindingSchema).min(1),
  })
  .superRefine((layer, ctx) => {
    const seen = new Set<KeymapSurface>();
    layer.owns.forEach((surface, index) => {
      if (seen.has(surface)) {
        ctx.addIssue({
          code: "custom",
          path: ["owns", index],
          message: `duplicate surface "${surface}"`,
        });
      }
      seen.add(surface);
    });
  });

export type KeymapLayer = z.output<typeof keymapLayerSchema>;
export type KeymapLayerInput = z.input<typeof keymapLayerSchema>;

/** A parsed layer plus where it came from, for collection-level errors. */
export interface LoadedKeymapLayer {
  readonly layer: KeymapLayer;
  readonly source: string;
}

/** One catalog file as it was read from disk. */
export interface KeymapLayerSource {
  readonly path: string;
  readonly text: string;
}

/**
 * Every problem of a whole set of layers at once. Same shape as `ContentValidationError`: catalogs
 * are validated as a set, not one file at a time.
 */
export class KeymapValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Invalid keymap layers (${issues.length} problem${issues.length === 1 ? "" : "s"}):\n${issues
        .map((issue) => `  - ${issue}`)
        .join("\n")}`,
    );
    this.name = "KeymapValidationError";
    this.issues = issues;
  }
}

/** Validates one layer. Throws `ExerciseValidationError`-style errors with the offending paths. */
export function parseKeymapLayer(input: unknown, source?: string): KeymapLayer {
  const result = keymapLayerSchema.safeParse(input);
  if (!result.success) throw new ExerciseValidationError(formatIssues(result.error), source);
  return result.data;
}

export function parseKeymapLayerYaml(text: string, source?: string): KeymapLayer {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (error) {
    throw new ExerciseValidationError(
      [`YAML syntax error: ${error instanceof Error ? error.message : String(error)}`],
      source,
    );
  }
  return parseKeymapLayer(data, source);
}

/** Reports one `extends` cycle per cycle found, e.g. `a -> b -> a`. */
function findExtendsCycles(byId: ReadonlyMap<string, LoadedKeymapLayer>): string[] {
  const errors: string[] = [];
  const finished = new Set<string>();

  const visit = (id: string, path: readonly string[]): void => {
    if (finished.has(id)) return;
    const at = path.indexOf(id);
    if (at !== -1) {
      errors.push(`extends cycle: ${[...path.slice(at), id].join(" -> ")}`);
      return;
    }
    for (const parent of byId.get(id)?.layer.extends ?? []) visit(parent, [...path, id]);
    finished.add(id);
  };

  for (const id of byId.keys()) visit(id, []);
  return errors;
}

/** `keys` + normalized modes: the pair a child may not repeat without `override: true`. */
const pairOf = (binding: KeymapBinding): string =>
  `${binding.keys}\u0000${[...binding.modes].sort().join(",")}`;

/** Every binding reachable through `extends`, with the catalog it came from. */
function inheritedBindings(
  entry: LoadedKeymapLayer,
  byId: ReadonlyMap<string, LoadedKeymapLayer>,
): Map<string, string> {
  const pairs = new Map<string, string>();
  const seen = new Set<string>();
  const pending = [...entry.layer.extends];
  while (pending.length > 0) {
    const id = pending.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const ancestor = byId.get(id);
    if (ancestor === undefined) continue;
    for (const binding of ancestor.layer.bindings) {
      const pair = pairOf(binding);
      if (!pairs.has(pair)) pairs.set(pair, ancestor.source);
    }
    pending.push(...ancestor.layer.extends);
  }
  return pairs;
}

/**
 * Collection rules for a set of layers: ids are unique, every `extends` resolves and no cycle
 * forms, and a binding never silently repeats an inherited `(keys, modes)` pair.
 */
export function validateKeymapLayers(layers: readonly LoadedKeymapLayer[]): string[] {
  const errors: string[] = [];
  const byId = new Map<string, LoadedKeymapLayer>();

  for (const entry of layers) {
    const first = byId.get(entry.layer.id);
    if (first === undefined) byId.set(entry.layer.id, entry);
    else {
      errors.push(
        `duplicate keymap layer id "${entry.layer.id}" in ${entry.source} (first defined in ${first.source})`,
      );
    }
  }

  for (const entry of layers) {
    for (const parent of entry.layer.extends) {
      if (!byId.has(parent)) {
        errors.push(`${entry.source}: layer ${entry.layer.id} extends unknown layer "${parent}"`);
      }
    }
  }
  errors.push(...findExtendsCycles(byId));

  for (const entry of layers) {
    const inherited = inheritedBindings(entry, byId);
    for (const binding of entry.layer.bindings) {
      if (binding.override) continue;
      const origin = inherited.get(pairOf(binding));
      if (origin === undefined) continue;
      const modes = binding.modes.length === 0 ? "" : ` in modes ${binding.modes.join(", ")}`;
      errors.push(
        `${entry.source}: layer ${entry.layer.id} repeats inherited binding "${binding.keys}"${modes} (from ${origin}); set override: true`,
      );
    }
  }

  return errors;
}

/**
 * Parses and cross-validates every catalog. Reports all problems at once and throws one
 * `KeymapValidationError`, so a bad catalog fails `pnpm content:ci` instead of rotting.
 */
export function parseKeymapLayers(sources: readonly KeymapLayerSource[]): readonly KeymapLayer[] {
  const errors: string[] = [];
  const loaded: LoadedKeymapLayer[] = [];
  for (const source of sources) {
    try {
      loaded.push({ layer: parseKeymapLayerYaml(source.text, source.path), source: source.path });
    } catch (error) {
      errors.push(
        error instanceof ExerciseValidationError
          ? error.message
          : `${source.path}: ${String(error)}`,
      );
    }
  }
  errors.push(...validateKeymapLayers(loaded));
  if (errors.length > 0) throw new KeymapValidationError(errors);
  return loaded.map((entry) => entry.layer);
}
