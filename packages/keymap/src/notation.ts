/**
 * The bridge between the keymap catalog notation (`content/keymaps/*.yaml`) and the key an input
 * actually pressed (keymap-layers.md S5, S6).
 *
 * Catalogs write keys the way a tool's manual does (`C-b`, `%`, `Space`, `S-h`); the practice area
 * sees what the browser sends. Adjudicating an attempt needs both sides in one shape to compare
 * them, and this module is the only place that knows the translation. It is deliberately free of
 * React and of the engines: the shape it reads is the five fields every recorded input has.
 *
 * A token carrying `S-` has no key form: the browser reports shift folded into the character the
 * layout produced (`S-h` arrives as key `H`), so there is no stable key to compare it with. Those
 * bindings therefore never match, which is acceptable: the caller says "no active layer claims it"
 * instead of guessing a layer, and no key is ever swallowed.
 */

/** Catalog names for keys whose browser name is different (`Space` is the `" "` character). */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  Enter: "Enter",
  Esc: "Escape",
  Space: " ",
  Tab: "Tab",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
};

const KEY_TO_TOKEN = new Map(
  Object.entries(NAMED_KEYS).map(([token, key]) => [key, token] as const),
);

/** One printable character, the same set the catalog notation accepts. */
const isPrintable = (text: string): boolean => text.length === 1 && text >= " " && text <= "~";

/** The part of an input the notation reads: a pressed key and its modifiers. */
export interface NotedInput {
  readonly key: string;
  readonly ctrl?: boolean | undefined;
  readonly alt?: boolean | undefined;
  readonly shift?: boolean | undefined;
  readonly meta?: boolean | undefined;
}

/** The same press with every modifier resolved, the shape `KeyInput` expects. */
export interface NotedKey {
  readonly key: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
}

/** A catalog token as the engine's logical input, or `null` when the notation has no equivalent. */
export function keymapTokenToKeyInput(token: string): NotedKey | null {
  let rest = token;
  let ctrl = false;
  let alt = false;
  let meta = false;
  for (;;) {
    if (rest.startsWith("C-")) {
      ctrl = true;
      rest = rest.slice(2);
    } else if (rest.startsWith("M-")) {
      alt = true;
      rest = rest.slice(2);
    } else if (rest.startsWith("Super-")) {
      meta = true;
      rest = rest.slice(6);
    } else break;
  }
  // See the note above: a shifted token is the case the notation cannot carry into a key.
  if (rest.startsWith("S-")) return null;
  const named = NAMED_KEYS[rest];
  const key = named ?? (isPrintable(rest) ? rest : undefined);
  if (key === undefined) return null;
  return { key, ctrl, alt, shift: false, meta };
}

/** The catalog token for a pressed key, or `null` when the notation has no form for it. */
export function keyInputToKeymapToken(input: NotedInput): string | null {
  const base = KEY_TO_TOKEN.get(input.key) ?? (isPrintable(input.key) ? input.key : undefined);
  if (base === undefined) return null;
  // Shift is never written: it is already in the character, and `S-` tokens never match (see above).
  const prefix =
    (input.ctrl === true ? "C-" : "") +
    (input.alt === true ? "M-" : "") +
    (input.meta === true ? "Super-" : "");
  return `${prefix}${base}`;
}
