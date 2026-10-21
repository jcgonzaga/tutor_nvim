import { firstNonBlankColumn } from "./buffer";
import type { CharSearch, CharSearchKind, DesiredColumn, Operator, Position } from "./types";
import { bckWord, charAt, endWord, fwdWord, isBlank, type Walker } from "./words";

export type MotionKind = "exclusive" | "inclusive" | "linewise";

export interface MotionEnv {
  readonly lines: readonly string[];
  readonly cursor: Position;
  readonly desiredColumn: DesiredColumn;
  /** Operator waiting for this motion, if any: a few motions behave differently under one. */
  readonly operator: Operator | null;
  readonly charSearch: CharSearch | null;
}

export interface MotionResult {
  /** May sit on the end-of-line position (`column === length`) for operator ranges. */
  readonly position: Position;
  readonly kind: MotionKind;
  /** `false` where Vim beeps; the cursor may still have moved (see `w`/`e` at the buffer end). */
  readonly ok: boolean;
  readonly desiredColumn?: DesiredColumn;
}

export interface Motion {
  readonly run: (env: MotionEnv) => MotionResult;
  /** Under an operator, Vim applies it even when the motion "fails" (h, l, w, e). */
  readonly proceedOnFail?: boolean;
}

const lineAt = (lines: readonly string[], line: number): string => lines[line] ?? "";

function stay(env: MotionEnv, kind: MotionKind = "exclusive"): MotionResult {
  return { position: env.cursor, kind, ok: false };
}

/** Column to land on in another line, honoring the sticky desired column. */
export function resolveColumn(desired: DesiredColumn, line: string): number {
  const last = Math.max(line.length - 1, 0);
  return desired === "end" ? last : Math.min(desired, last);
}

const left: Motion = {
  proceedOnFail: true,
  run: (env) => {
    const { line, column } = env.cursor;
    return column > 0
      ? { position: { line, column: column - 1 }, kind: "exclusive", ok: true }
      : stay(env);
  },
};

const right: Motion = {
  proceedOnFail: true,
  run: (env) => {
    const { line, column } = env.cursor;
    const length = lineAt(env.lines, line).length;
    if (env.operator !== null) {
      // Under an operator `l` may step onto the end of line, so `x` deletes the last character.
      return {
        position: { line, column: Math.min(column + 1, length) },
        kind: "exclusive",
        ok: true,
      };
    }
    return column < length - 1
      ? { position: { line, column: column + 1 }, kind: "exclusive", ok: true }
      : stay(env);
  },
};

/** `l`, exported because `x` is `dl`. */
export const MOVE_RIGHT: Motion = right;

function vertical(delta: 1 | -1): Motion {
  return {
    run: (env) => {
      const target = env.cursor.line + delta;
      if (target < 0 || target >= env.lines.length) return stay(env, "linewise");
      return {
        position: {
          line: target,
          column: resolveColumn(env.desiredColumn, lineAt(env.lines, target)),
        },
        kind: "linewise",
        ok: true,
        desiredColumn: env.desiredColumn,
      };
    },
  };
}

const lineStart: Motion = {
  run: (env) => ({ position: { line: env.cursor.line, column: 0 }, kind: "exclusive", ok: true }),
};

const firstNonBlank: Motion = {
  run: (env) => ({
    position: {
      line: env.cursor.line,
      column: firstNonBlankColumn(lineAt(env.lines, env.cursor.line)),
    },
    kind: "exclusive",
    ok: true,
  }),
};

const lineEnd: Motion = {
  run: (env) => ({
    position: {
      line: env.cursor.line,
      column: Math.max(lineAt(env.lines, env.cursor.line).length - 1, 0),
    },
    kind: "inclusive",
    ok: true,
    desiredColumn: "end",
  }),
};

function walkerFrom(cursor: Position): Walker {
  return { line: cursor.line, column: cursor.column };
}

/**
 * Finishes a word motion. Vim never leaves the cursor on the end-of-line
 * position after moving forward: it steps back and makes the motion inclusive,
 * which is what lets `dw` delete up to the end of the last word on a line.
 */
function wordResult(env: MotionEnv, pos: Walker, ok: boolean, kind: MotionKind): MotionResult {
  const movedForward =
    pos.line > env.cursor.line || (pos.line === env.cursor.line && pos.column > env.cursor.column);
  const atEndOfLine = pos.column > 0 && pos.column === lineAt(env.lines, pos.line).length;
  if (movedForward && atEndOfLine) {
    return { position: { line: pos.line, column: pos.column - 1 }, kind: "inclusive", ok };
  }
  return { position: { line: pos.line, column: pos.column }, kind, ok };
}

function wordForward(big: boolean): Motion {
  return {
    proceedOnFail: true,
    run: (env) => {
      const pos = walkerFrom(env.cursor);

      // `cw` on a word means `ce`: it must not eat the blanks after the word.
      if (env.operator === "change") {
        const char = charAt(env.lines, pos);
        if (char !== "" && !isBlank(char)) {
          const ok = endWord(env.lines, pos, big, true, false);
          return wordResult(env, pos, ok, "inclusive");
        }
      }

      const ok = fwdWord(env.lines, pos, big, env.operator !== null);
      return wordResult(env, pos, ok, "exclusive");
    },
  };
}

function wordBackward(big: boolean): Motion {
  return {
    run: (env) => {
      const pos = walkerFrom(env.cursor);
      const ok = bckWord(env.lines, pos, big);
      return { position: { line: pos.line, column: pos.column }, kind: "exclusive", ok };
    },
  };
}

function wordEnd(big: boolean): Motion {
  return {
    proceedOnFail: true,
    run: (env) => {
      const pos = walkerFrom(env.cursor);
      const ok = endWord(env.lines, pos, big, false, false);
      return wordResult(env, pos, ok, "inclusive");
    },
  };
}

/** Single-key motions. */
export const MOTIONS: Readonly<Record<string, Motion>> = {
  h: left,
  l: right,
  j: vertical(1),
  k: vertical(-1),
  "0": lineStart,
  "^": firstNonBlank,
  $: lineEnd,
  w: wordForward(false),
  W: wordForward(true),
  b: wordBackward(false),
  B: wordBackward(true),
  e: wordEnd(false),
  E: wordEnd(true),
};

/**
 * `f`/`t` (and `;`/`,` via `repeat`). Searches the current line only. Repeating
 * a `t` search must not get stuck in front of the same character, so the first
 * candidate is skipped (Vim's default `cpo` without `;`).
 */
export function searchChar(env: MotionEnv, search: CharSearch, repeat: boolean): MotionResult {
  const line = lineAt(env.lines, env.cursor.line);
  const step = search.direction === "forward" ? 1 : -1;
  let column = env.cursor.column;
  let canStop = !(repeat && search.kind === "till");

  for (;;) {
    column += step;
    if (column < 0 || column >= line.length) return stay(env, "inclusive");
    if (line.charAt(column) === search.char && canStop) break;
    canStop = true;
  }
  if (search.kind === "till") column -= step;

  return {
    position: { line: env.cursor.line, column },
    kind: search.direction === "forward" ? "inclusive" : "exclusive",
    ok: true,
  };
}

export function reverseSearch(search: CharSearch): CharSearch {
  return { ...search, direction: search.direction === "forward" ? "backward" : "forward" };
}

export function newCharSearch(kind: CharSearchKind, char: string): CharSearch {
  return { kind, char, direction: "forward" };
}
