import { bufferFromLines, insertText, normalizeCursor, readLine, replaceRange } from "./buffer";
import { INNER_TEXT_OBJECTS } from "./text-objects";
import type {
  DispatchResult,
  KeyInput,
  Operator,
  PendingCommand,
  Position,
  Range,
  TextObjectModifier,
  VimMode,
  VimState,
} from "./types";

export interface InitialVimState {
  readonly lines: readonly string[];
  readonly cursor?: Position;
  readonly mode?: VimMode;
}

export function createVimState(initial: InitialVimState): VimState {
  const buffer = bufferFromLines(initial.lines);
  const mode = initial.mode ?? "normal";
  return {
    mode,
    buffer,
    cursor: normalizeCursor(buffer, initial.cursor ?? { line: 0, column: 0 }, mode),
    pending: null,
  };
}

/** Operator keys of the supported grammar. */
const OPERATORS: Readonly<Record<string, Operator>> = { c: "change" };

/** Text-object modifier keys (`i` in `ci"`). */
const TEXT_OBJECT_MODIFIERS: Readonly<Record<string, TextObjectModifier>> = { i: "inner" };

/** The keys typed so far for a half-entered command (`c`, `ci`), for display. */
export function pendingKeys(pending: PendingCommand | null): string {
  if (pending === null) return "";
  const operatorKey = keyFor(OPERATORS, pending.operator);
  if (pending.kind === "operator") return operatorKey;
  return operatorKey + keyFor(TEXT_OBJECT_MODIFIERS, pending.modifier);
}

function keyFor<T extends string>(table: Readonly<Record<string, T>>, value: T): string {
  return Object.entries(table).find(([, candidate]) => candidate === value)?.[0] ?? "";
}

/**
 * Applies one input. Pure: the previous state is never mutated, so the same
 * `(state, input)` always yields the same result and a run can be replayed.
 */
export function dispatch(state: VimState, input: KeyInput): DispatchResult {
  return state.mode === "insert" ? dispatchInsert(state, input) : dispatchNormal(state, input);
}

/** Folds a key sequence over a state. Rejected keys leave the state unchanged (as in `dispatch`). */
export function runKeys(state: VimState, inputs: readonly KeyInput[]): VimState {
  return inputs.reduce((current, input) => dispatch(current, input).state, state);
}

function dispatchInsert(state: VimState, input: KeyInput): DispatchResult {
  if (isEscape(input)) {
    const cursor = { line: state.cursor.line, column: Math.max(state.cursor.column - 1, 0) };
    return accept({ ...state, mode: "normal", cursor, pending: null });
  }

  if (isPrintable(input)) {
    const inserted = insertText(state.buffer, state.cursor, input.key);
    return accept({ ...state, buffer: inserted.buffer, cursor: inserted.end });
  }

  return reject(state);
}

function dispatchNormal(state: VimState, input: KeyInput): DispatchResult {
  if (isEscape(input)) return accept({ ...state, pending: null });
  if (hasCommandModifiers(input)) return reject(state);

  const { pending } = state;

  if (pending === null) {
    if (input.key === "i") return accept({ ...state, mode: "insert" });

    const operator = OPERATORS[input.key];
    if (operator !== undefined) {
      return accept({ ...state, pending: { kind: "operator", operator } });
    }
    return reject(state);
  }

  if (pending.kind === "operator") {
    const modifier = TEXT_OBJECT_MODIFIERS[input.key];
    if (modifier === undefined) return reject(state);
    return accept({
      ...state,
      pending: { kind: "text-object", operator: pending.operator, modifier },
    });
  }

  const finder = INNER_TEXT_OBJECTS[input.key];
  if (finder === undefined) return reject(state);

  const { line, column } = state.cursor;
  const span = finder(readLine(state.buffer, line), column);
  if (span === null) return reject(state);

  const range: Range = {
    start: { line, column: span.start },
    end: { line, column: span.end },
  };
  return accept(applyOperator(state, pending.operator, range));
}

function applyOperator(state: VimState, operator: Operator, range: Range): VimState {
  switch (operator) {
    case "change": {
      const { buffer } = replaceRange(state.buffer, range.start, range.end, "");
      return { ...state, mode: "insert", buffer, cursor: range.start, pending: null };
    }
  }
}

function accept(state: VimState): DispatchResult {
  return { state, accepted: true };
}

/** Unsupported or failed input: stay put and cancel any half-typed command. */
function reject(state: VimState): DispatchResult {
  return { state: state.pending === null ? state : { ...state, pending: null }, accepted: false };
}

function isEscape(input: KeyInput): boolean {
  return input.key === "Escape";
}

function hasCommandModifiers(input: KeyInput): boolean {
  return input.ctrl === true || input.alt === true || input.meta === true;
}

/** A single typed character (one code point); layout-composed characters included. */
function isPrintable(input: KeyInput): boolean {
  return !hasCommandModifiers(input) && [...input.key].length === 1;
}
