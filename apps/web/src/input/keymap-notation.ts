import type { KeyInput } from "@tutor-nvim/vim-engine";

/**
 * The bridge between the keymap catalog notation (`content/keymaps/*.yaml`) and the engine's
 * `KeyInput` (keymap-layers.md S5).
 *
 * Catalogs write keys the way a tool's manual does (`C-b`, `%`, `Space`, `S-h`); the practice area
 * sees what the browser sends. The rail needs both sides in one shape to compare them, and this
 * module is the only place that knows the translation. It is deliberately free of React.
 *
 * A token carrying `S-` has no `KeyInput` form: the browser reports shift folded into the character
 * the layout produced (`S-h` arrives as key `H`), so there is no stable key to compare it with. Those
 * bindings therefore never match, which is acceptable for a label: the rail says "no active layer
 * claims it" instead of guessing a layer, and no key is ever swallowed.
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

/** The part of an input the notation reads: a `KeyInput`, or an attempt's `InputEvent`. */
export type NotedInput = Pick<KeyInput, "key" | "ctrl" | "alt" | "shift" | "meta">;

/** A catalog token as the engine's logical input, or `null` when the notation has no equivalent. */
export function keymapTokenToKeyInput(token: string): KeyInput | null {
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
  // See the note above: a shifted token is the case the notation cannot carry into `KeyInput`.
  if (rest.startsWith("S-")) return null;
  const named = NAMED_KEYS[rest];
  const key = named ?? (isPrintable(rest) ? rest : null);
  if (key === null) return null;
  return { key, ctrl, alt, shift: false, meta };
}

/** The catalog token for a pressed key, or `null` when the notation has no form for it. */
export function keyInputToKeymapToken(input: NotedInput): string | null {
  const base = KEY_TO_TOKEN.get(input.key) ?? (isPrintable(input.key) ? input.key : null);
  if (base === null) return null;
  // Shift is never written: it is already in the character, and `S-` tokens never match (see above).
  const prefix =
    (input.ctrl === true ? "C-" : "") +
    (input.alt === true ? "M-" : "") +
    (input.meta === true ? "Super-" : "");
  return `${prefix}${base}`;
}
