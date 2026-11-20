/**
 * The workspace view's one route to `@tutor-nvim/workspace-engine` (T8).
 *
 * It exists so the dependency is visible in a single file instead of ten: the panes, the key
 * resolution and the screen all take the engine's state, tree and action names from here, and a
 * change of package or entry point is one line rather than a rewrite of the view.
 */
export * from "@tutor-nvim/workspace-engine";
