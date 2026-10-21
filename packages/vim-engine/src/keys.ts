import type { KeyInput } from "./types";

/**
 * Vim key notation (`ci"production<Esc>`) <-> `KeyInput`.
 *
 * A *token* is the canonical text for one key press: the character itself, or
 * `<Name>` for special keys, optionally with `C-`/`M-`/`D-` modifier prefixes
 * (`<C-r>`). Tokens are what exercise solutions and telemetry compare.
 */

export class KeySequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeySequenceError";
  }
}

/** Notation name -> `KeyboardEvent.key` value. */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  Esc: "Escape",
  CR: "Enter",
  BS: "Backspace",
  Del: "Delete",
  Tab: "Tab",
  Space: " ",
  lt: "<",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Home: "Home",
  End: "End",
};

const NAME_BY_KEY: ReadonlyMap<string, string> = new Map(
  Object.entries(NAMED_KEYS).map(([name, key]) => [key, name]),
);

const NAME_BY_LOWERCASE: ReadonlyMap<string, string> = new Map(
  Object.keys(NAMED_KEYS).map((name) => [name.toLowerCase(), name]),
);

const SPECIAL_KEY = /^<([^<>\s]+)>/;

/** Canonical token for an input, e.g. `c`, `"`, `<Esc>`, `<C-r>`. */
export function formatKey(input: KeyInput): string {
  const modifiers = (input.ctrl ? "C-" : "") + (input.alt ? "M-" : "") + (input.meta ? "D-" : "");
  const named = NAME_BY_KEY.get(input.key);
  if (named === undefined && modifiers === "" && [...input.key].length === 1) return input.key;

  const base =
    named ?? (modifiers !== "" && input.key.length === 1 ? input.key.toLowerCase() : input.key);
  return `<${modifiers}${base}>`;
}

/** Splits a key sequence into canonical tokens. Throws `KeySequenceError` on bad notation. */
export function tokenizeKeySequence(sequence: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < sequence.length) {
    const rest = sequence.slice(index);
    const special = SPECIAL_KEY.exec(rest);
    if (special) {
      tokens.push(formatKey(keyFromSpecial(special[1] ?? "", special[0])));
      index += special[0].length;
      continue;
    }
    const char = String.fromCodePoint(rest.codePointAt(0) ?? 0);
    tokens.push(formatKey({ key: char }));
    index += char.length;
  }
  return tokens;
}

export function parseKeySequence(sequence: string): KeyInput[] {
  return tokenizeKeySequence(sequence).map(keyInputFromToken);
}

/** Converts one canonical token (as produced by `tokenizeKeySequence`) to an input. */
export function keyInputFromToken(token: string): KeyInput {
  const special = SPECIAL_KEY.exec(token);
  if (special && special[0].length === token.length) {
    return keyFromSpecial(special[1] ?? "", token);
  }
  return { key: token };
}

function keyFromSpecial(body: string, notation: string): KeyInput {
  let rest = body;
  let ctrl = false;
  let alt = false;
  let meta = false;
  for (;;) {
    const prefix = /^([CMD])-(.+)$/i.exec(rest);
    if (!prefix) break;
    const flag = (prefix[1] ?? "").toUpperCase();
    if (flag === "C") ctrl = true;
    else if (flag === "M") alt = true;
    else meta = true;
    rest = prefix[2] ?? "";
  }

  const name = NAME_BY_LOWERCASE.get(rest.toLowerCase());
  let key: string;
  if (name !== undefined) {
    key = NAMED_KEYS[name] ?? rest;
  } else if ([...rest].length === 1 && (ctrl || alt || meta)) {
    key = rest;
  } else {
    throw new KeySequenceError(`Unknown key notation ${notation}`);
  }

  return {
    key,
    ...(ctrl ? { ctrl: true } : {}),
    ...(alt ? { alt: true } : {}),
    ...(meta ? { meta: true } : {}),
  };
}
