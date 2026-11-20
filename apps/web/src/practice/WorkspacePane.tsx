import type { ReactNode } from "react";
import { useT } from "../i18n/I18nProvider";
import { EditorView } from "./EditorView";
import { WorkspaceTerminalView } from "./WorkspaceTerminalView";
import {
  activeTab,
  isLeafNode,
  leafNodes,
  windowPaths,
  type FocusStep,
  type WindowLeaf,
  type WindowNode,
  type WorkspaceState,
} from "./workspaceEngine";

/**
 * The window tree of the active tab, drawn as panes (T6, T8).
 *
 * The tree, the focus path and the ratios are the engine's, so the screen never recomputes a layout:
 * a split draws two panes with the share `ratio` gives the first one, side by side or stacked, and a
 * leaf draws what it shows. Panes are flex children with `flex-basis: 0`, so "share of the tab" means
 * the same thing whatever the window is wide.
 *
 * A leaf is one of two things and is drawn by its own view: a buffer by the editor the practice area
 * already uses, a terminal session by `WorkspaceTerminalView`.
 */

/** The same focus path: two lists of steps that reach the same window. */
function samePath(left: readonly FocusStep[], right: readonly FocusStep[]): boolean {
  return left.length === right.length && left.every((step, index) => step === right[index]);
}

export function WorkspacePanes({ state }: { readonly state: WorkspaceState }) {
  const tab = activeTab(state);
  if (tab === undefined) return null;
  const focusPath = tab.focus;
  // Pre-order leaves and their labels come from the engine, so a pane is numbered and named exactly
  // as the `windows` goal sees it instead of the view inventing a second order.
  const leaves = leafNodes(tab.root);
  const labels = windowPaths(state);
  const zoom = state.zoom !== null && state.zoom.tabId === tab.id ? state.zoom.leafPath : null;

  function draw(node: WindowNode, path: readonly FocusStep[]): ReactNode {
    if (isLeafNode(node)) {
      const index = leaves.indexOf(node);
      return (
        <WorkspacePane
          state={state}
          leaf={node}
          index={index}
          total={leaves.length}
          label={labels[index] ?? ""}
          focused={samePath(path, focusPath)}
          zoomed={zoom !== null && samePath(path, zoom)}
        />
      );
    }
    const row = node.layout === "side-by-side";
    return (
      <div
        data-testid="workspace-split"
        className={`flex min-h-0 min-w-0 flex-1 ${row ? "flex-row" : "flex-col"}`}
      >
        <div className="flex min-h-0 min-w-0" style={{ flexBasis: 0, flexGrow: node.ratio }}>
          {draw(node.first, [...path, "first"])}
        </div>
        <div aria-hidden className={row ? "w-px flex-none bg-line" : "h-px flex-none bg-line"} />
        <div className="flex min-h-0 min-w-0" style={{ flexBasis: 0, flexGrow: 1 - node.ratio }}>
          {draw(node.second, [...path, "second"])}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="workspace-panes" className="flex min-h-[260px] flex-col bg-surface">
      {draw(tab.root, [])}
    </div>
  );
}

interface WorkspacePaneProps {
  readonly state: WorkspaceState;
  readonly leaf: WindowLeaf;
  /** Pre-order position among the tab's leaves, and how many there are. */
  readonly index: number;
  readonly total: number;
  /** What the window shows: the file's path, or `terminal:<title>`, as the engine prints it. */
  readonly label: string;
  readonly focused: boolean;
  readonly zoomed: boolean;
}

/**
 * One window: its label, its place, the words for the state a colour could not carry, and what it
 * shows. The focus ring is drawn *beside* the word "focused", never instead of it (AGENTS.md 19).
 */
function WorkspacePane({ state, leaf, index, total, label, focused, zoomed }: WorkspacePaneProps) {
  const t = useT();
  const ring = focused ? "ring-2 ring-inset ring-amber" : "ring-1 ring-inset ring-line-faint";
  return (
    <section
      data-testid="workspace-pane"
      data-focused={focused ? "true" : "false"}
      aria-label={t.practice.workspace.pane(index + 1, total)}
      className={`flex min-h-0 min-w-0 flex-1 flex-col bg-surface ${ring}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 font-mono text-[12.5px]">
        <span data-testid="workspace-pane-label" className="font-bold text-ink-2">
          {label}
        </span>
        <span className="text-ink-3">{t.practice.workspace.pane(index + 1, total)}</span>
        {focused ? (
          <span data-testid="workspace-pane-focus" className="font-bold text-amber-hi">
            <span aria-hidden>▸ </span>
            {t.practice.workspace.focused}
          </span>
        ) : null}
        {zoomed ? (
          <span data-testid="workspace-pane-zoom" className="font-bold text-ink">
            <span aria-hidden>⤢ </span>
            {t.practice.workspace.zoomed}
          </span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {leaf.kind === "terminal" ? (
          <TerminalLeaf state={state} leaf={leaf} />
        ) : (
          <BufferLeaf state={state} leaf={leaf} />
        )}
      </div>
    </section>
  );
}

/** A window showing a file: the buffer's own text, cursor and mode, through the existing editor. */
function BufferLeaf({
  state,
  leaf,
}: {
  readonly state: WorkspaceState;
  readonly leaf: WindowLeaf;
}) {
  const buffer =
    leaf.kind === "leaf"
      ? state.buffers.find((candidate) => candidate.id === leaf.bufferId)
      : undefined;
  // A leaf pointing at a buffer the state does not hold is a state that broke an invariant: the pane
  // shows nothing rather than the wrong file.
  if (buffer === undefined) return null;
  return (
    <EditorView
      lines={buffer.editor.buffer.lines}
      cursor={buffer.editor.cursor}
      mode={buffer.editor.mode}
      pending={buffer.editor.pending !== null}
      minRows={2}
    />
  );
}

/** A window showing a session: one terminal, its scrollback and its own prompt line. */
function TerminalLeaf({
  state,
  leaf,
}: {
  readonly state: WorkspaceState;
  readonly leaf: WindowLeaf;
}) {
  const terminal =
    leaf.kind === "terminal"
      ? state.terminals.find((candidate) => candidate.id === leaf.terminalId)
      : undefined;
  if (terminal === undefined) return null;
  return <WorkspaceTerminalView terminal={terminal} />;
}
