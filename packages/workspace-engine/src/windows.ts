import type {
  FocusStep,
  LeafWindow,
  SplitWindow,
  WindowLayout,
  WindowNode,
  WorkspaceState,
  WorkspaceTab,
  WorkspaceZoom,
} from "./types";

/*
 * The window tree of T2, as plain functions over plain data: leaves, splits, focus paths and the
 * ratios between them (S2, S4).
 *
 * Everything here is pure and total over the shapes it is handed. A focus path always reaches a
 * leaf in a valid state, so a helper that cannot find one returns `undefined` instead of throwing:
 * the action layer turns that into `applied: false` with a reason.
 */

export const leafNode = (bufferId: string): LeafWindow => ({ kind: "leaf", bufferId });

export const splitNode = (
  layout: WindowLayout,
  ratio: number,
  first: WindowNode,
  second: WindowNode,
): SplitWindow => ({ kind: "split", layout, ratio, first, second });

/** The node a focus path points at, or `undefined` when the path does not reach one. */
export function nodeAt(node: WindowNode, path: readonly FocusStep[]): WindowNode | undefined {
  const [step, ...rest] = path;
  if (step === undefined) return node;
  if (node.kind === "leaf") return undefined;
  return nodeAt(step === "first" ? node.first : node.second, rest);
}

/** The same tree with the node at `path` replaced; a path that does not reach a leaf changes nothing. */
export function replaceAt(
  node: WindowNode,
  path: readonly FocusStep[],
  replacement: WindowNode,
): WindowNode {
  const [step, ...rest] = path;
  if (step === undefined) return replacement;
  if (node.kind === "leaf") return node;
  return step === "first"
    ? { ...node, first: replaceAt(node.first, rest, replacement) }
    : { ...node, second: replaceAt(node.second, rest, replacement) };
}

/**
 * The path to the last leaf of a subtree: where focus lands when its sibling closes, and the window
 * a direction or a swap treats as "the other side".
 */
export function lastLeafPath(node: WindowNode): readonly FocusStep[] {
  return node.kind === "leaf" ? [] : ["second", ...lastLeafPath(node.second)];
}

/** The leaf a tab's focus path points at, or `undefined` when the tree and the path disagree. */
export function focusLeaf(tab: WorkspaceTab): LeafWindow | undefined {
  const node = nodeAt(tab.root, tab.focus);
  return node?.kind === "leaf" ? node : undefined;
}

/** The tab the keys go to. */
export function activeTab(state: WorkspaceState): WorkspaceTab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeTabId);
}

/** Every buffer a tree shows, in tree order. The same id may appear twice: a split does that. */
export function leafBufferIds(node: WindowNode): readonly string[] {
  return node.kind === "leaf"
    ? [node.bufferId]
    : [...leafBufferIds(node.first), ...leafBufferIds(node.second)];
}

/**
 * A zoom only means something while the window it names is still a window: after a close it is
 * dropped instead of pointing at a pane that no longer exists.
 */
function pruneZoom(
  tabs: readonly WorkspaceTab[],
  zoom: WorkspaceZoom | null,
): WorkspaceZoom | null {
  if (zoom === null) return null;
  const tab = tabs.find((candidate) => candidate.id === zoom.tabId);
  if (tab === undefined) return null;
  return nodeAt(tab.root, zoom.leafPath)?.kind === "leaf" ? zoom : null;
}

/**
 * The state with a new tab list and active tab, and everything derived from them: the active buffer
 * is the focused window's buffer, never a second source of truth.
 */
export function withTabs(
  state: WorkspaceState,
  tabs: readonly WorkspaceTab[],
  activeTabId: string,
): WorkspaceState {
  const tab = tabs.find((candidate) => candidate.id === activeTabId);
  const focused = tab === undefined ? undefined : focusLeaf(tab);
  return {
    ...state,
    tabs,
    activeTabId,
    activeBufferId: focused?.bufferId ?? state.activeBufferId,
    zoom: pruneZoom(tabs, state.zoom),
  };
}

/** The state with one tab replaced, keeping whichever tab is active. */
export function withActiveTab(state: WorkspaceState, tab: WorkspaceTab): WorkspaceState {
  return withTabs(
    state,
    state.tabs.map((candidate) => (candidate.id === tab.id ? tab : candidate)),
    state.activeTabId,
  );
}

/** Moves focus inside a tab; the active buffer follows because it always follows the focused leaf. */
export function withFocus(
  state: WorkspaceState,
  tabId: string,
  focus: readonly FocusStep[],
): WorkspaceState {
  const tabs = state.tabs.map((tab) => (tab.id === tabId ? { ...tab, focus } : tab));
  return withTabs(state, tabs, state.activeTabId);
}

/**
 * Points the focused window at a buffer and makes it active. This is how `:e`, `:bn` and `:bp`
 * change what is on screen: focus and the active buffer move together, never apart.
 */
export function withActiveBuffer(state: WorkspaceState, bufferId: string): WorkspaceState {
  const tabs = state.tabs.map((tab) =>
    tab.id === state.activeTabId
      ? { ...tab, root: replaceAt(tab.root, tab.focus, leafNode(bufferId)) }
      : tab,
  );
  return { ...state, tabs, activeBufferId: bufferId, zoom: pruneZoom(tabs, state.zoom) };
}
