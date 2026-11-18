/**
 * The keymap vocabulary: surfaces, modes, actions and targets. It is data only and imports nothing,
 * so the exercise schema can use it without pulling the YAML parser and the layer validator in with
 * it (that cycle made `z.enum(...)` run before its list existed).
 */

/** Version of the keymap layer content format. Bump with an explicit migration. */
export const KEYMAP_SCHEMA_VERSION = 1;

/** Where a layer's keys are read: the surface it owns (ADR-0006, decision 2). */
export const KEYMAP_SURFACES = ["shell", "editor", "multiplexer", "window-manager"] as const;
export type KeymapSurface = (typeof KEYMAP_SURFACES)[number];

/** The modes a binding can be limited to; no `modes` means any mode. */
export const KEYMAP_MODES = ["normal", "insert", "visual", "resize", "copy-mode"] as const;
export type KeymapMode = (typeof KEYMAP_MODES)[number];

/**
 * The closed action vocabulary (v2, `odd/tasks/keymap-layers.md`). Exercises will ask for an action
 * (S6) and any enabled layer that provides it solves them, so an action is a shared word across
 * tools, never a keystroke. Ordered the way a learner meets it: the editor verbs first, then the
 * surface-level ones.
 *
 * Splits are named by the layout they produce, because tools disagree on the word "horizontal":
 * tmux `%` leaves panes side by side while Neovim `:split` stacks windows.
 */
export const KEYMAP_ACTIONS = [
  "motion.char-left",
  "motion.char-right",
  "motion.char-up",
  "motion.char-down",
  "motion.word-forward",
  "motion.word-backward",
  "motion.word-end",
  "motion.word-forward-big",
  "motion.word-backward-big",
  "motion.word-end-big",
  "motion.line-start",
  "motion.line-first-non-blank",
  "motion.line-end",
  "motion.find-char",
  "motion.find-char-backward",
  "motion.repeat-find",
  "motion.repeat-find-reverse",
  "edit.insert-before",
  "edit.insert-after",
  "edit.open-line-below",
  "edit.normal-mode",
  "edit.delete",
  "edit.change",
  "edit.yank",
  "edit.delete-char",
  "edit.put-after",
  "edit.put-before",
  "edit.undo",
  "edit.redo",
  "edit.repeat",
  "file.open",
  "file.find",
  "file.save",
  "file.new",
  "file.close-buffer",
  "buffer.next",
  "buffer.previous",
  "buffer.list",
  "grep.project",
  "window.split-side-by-side",
  "window.split-stacked",
  "window.close",
  "window.focus-left",
  "window.focus-right",
  "window.focus-up",
  "window.focus-down",
  "window.resize-wider",
  "window.resize-narrower",
  "window.resize-taller",
  "window.resize-shorter",
  "window.zoom",
  "window.swap",
  "window.new",
  "app.launch-terminal",
  "workspace.switch",
  "session.detach",
  "session.attach",
  "tab.new",
  "tab.next",
  "tab.previous",
  "shell.clear-line",
  "shell.history-search",
  "shell.complete",
] as const;
export type KeymapAction = (typeof KEYMAP_ACTIONS)[number];

/**
 * What a text object acts on, so `di"` and `dap` stay one action instead of one action each (v2,
 * decision 3). Only the actions in `KEYMAP_TARGETED_ACTIONS` may carry one.
 */
export const KEYMAP_TARGETS = [
  "char",
  "line",
  "word",
  "inner-word",
  "inner-quotes",
  "inner-parens",
  "inner-braces",
  "around-quotes",
  "around-parens",
  "around-braces",
] as const;
export type KeymapTarget = (typeof KEYMAP_TARGETS)[number];

/** The only actions a binding may give a `target`: the operator verbs that need one. */
export const KEYMAP_TARGETED_ACTIONS = ["edit.delete", "edit.change", "edit.yank"] as const;

