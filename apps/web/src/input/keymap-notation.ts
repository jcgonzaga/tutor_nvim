/**
 * The notation bridge moved to `@tutor-nvim/keymap` (keymap-layers.md L11): the resolver, the cost
 * table and the adjudication of an action attempt all read the same translation, so it lives with
 * them instead of only in the web app. Re-exported here for the practice screen's existing imports.
 */
export {
  keyInputToKeymapToken,
  keymapTokenToKeyInput,
  type NotedInput,
  type NotedKey,
} from "@tutor-nvim/keymap";
