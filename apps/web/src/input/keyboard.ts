import type { TimedKeyInput } from "@tutor-nvim/evaluation";
import type { KeyInput } from "@tutor-nvim/vim-engine";

/** The subset of `KeyboardEvent` the adapter reads (also lets tests use plain objects). */
export interface KeyboardEventLike {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly isComposing?: boolean;
  getModifierState?(key: string): boolean;
}

/** Keys that never carry a command: modifiers, lock keys, IME/dead-key plumbing, and Tab (kept for focus navigation). */
const IGNORED_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "FnLock",
  "Dead",
  "Process",
  "Unidentified",
  "Tab",
]);

/** Non-printable keys that would scroll or navigate the page if left alone. */
const CAPTURED_NAMED_KEYS: ReadonlySet<string> = new Set([
  "Escape",
  "Enter",
  "Backspace",
  "Delete",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/**
 * Normalizes a browser keyboard event into the engine's logical input, keeping
 * both `key` (what the layout produced) and `code` (physical key). Returns
 * `null` for events that are not input (modifier presses, IME composition, Tab).
 */
export function toKeyInput(event: KeyboardEventLike, timestamp: number): TimedKeyInput | null {
  if (event.isComposing === true || IGNORED_KEYS.has(event.key)) return null;

  // AltGr is reported as Ctrl+Alt on some platforms; with a layout like ES ISO it
  // is just how `@`, `{`, `}`, `[`, `]`, `\` and `|` are typed, not a command chord.
  const altGraph = event.getModifierState?.("AltGraph") === true;

  return {
    key: event.key,
    code: event.code,
    ctrl: event.ctrlKey && !altGraph,
    alt: event.altKey && !altGraph,
    shift: event.shiftKey,
    meta: event.metaKey,
    timestamp,
  };
}

/** Chords the Vim subset uses, so the browser must not also act on them (`Ctrl+r` is redo, not reload). */
const VIM_CHORDS: ReadonlySet<string> = new Set(["r"]);
/** Chords of the terminal: `Ctrl+c` abandons the line (not copy), `Ctrl+u` clears it (not view source). */
const SHELL_CHORDS: ReadonlySet<string> = new Set(["c", "u"]);

/**
 * Whether the browser's default action should be suppressed. Chords the engine
 * does not use (Ctrl/Alt/Cmd + key) and function keys are left alone so
 * devtools, tab switching, reload (F5) etc. keep working inside the practice area.
 */
export function shouldPreventDefault(input: KeyInput, kind: "vim" | "shell" = "vim"): boolean {
  if (input.ctrl === true && input.alt !== true && input.meta !== true) {
    return (kind === "shell" ? SHELL_CHORDS : VIM_CHORDS).has(input.key.toLowerCase());
  }
  if (input.ctrl === true || input.alt === true || input.meta === true) return false;
  return [...input.key].length === 1 || CAPTURED_NAMED_KEYS.has(input.key);
}
