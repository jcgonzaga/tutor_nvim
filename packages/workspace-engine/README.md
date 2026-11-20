# @tutor-nvim/workspace-engine

The simulated developer desktop (S2, S4): the simulated disk, the open buffers, the window tree that
shows them and the terminal sessions beside them. The package owns everything _around_ the text: it
never edits it (keys reach `vim-engine`'s `dispatch`) and knows no React, users, persistence, real I/O
or clock (AGENTS.md 2.3, 5) — so a story replays in a test and two whole states compare equal.

`dispatchWorkspace(state, key)` takes keys (`:`, a terminal's prompt, everything else to
`vim-engine`); `applyWorkspaceAction(state, action, options?)` takes files, buffers, windows, tabs,
terminals and sessions, **never** keys. A catalog maps a tool's keys to an action name and
`@tutor-nvim/keymap` resolves them, so tmux's `C-b %` and Herdr's `C-b v` reach the same split.

## State

```ts
interface WorkspaceState {
  readonly files: Readonly<Record<string, string>>; // the simulated disk: path -> text
  readonly buffers: readonly WorkspaceBuffer[]; // opening order; each id appears once
  readonly activeBufferId: string; // the buffer of the focused file window
  readonly tabs: readonly WorkspaceTab[]; // { id, root, focus }: a tree and a focus path each
  readonly activeTabId: string;
  readonly zoom: WorkspaceZoom | null; // { tabId, leafPath }: a note beside the tree
  readonly terminals: readonly WorkspaceTerminal[]; // one per launch: entries and a prompt
  readonly matches: readonly WorkspaceGrepMatch[]; // the last `grep.project`, path then line
  readonly pending: PendingWorkspaceCommand | null; // the half-typed `:` line
  readonly detached: boolean; // session flag: freezes every action but the session's own
  readonly mode: WorkspaceMode; // "normal" | "resize": the input mode, not the layout
}

type WindowNode =
  | { kind: "leaf"; bufferId: string } // a window showing a file
  | { kind: "terminal"; terminalId: string } // a window showing a session
  | { kind: "split"; layout: WindowLayout; ratio: number; first: WindowNode; second: WindowNode };
```

A tab's `focus` is `("first" | "second")[]` (`[]` is one window); a buffer is
`{ id, path, editor: VimState, modified }`; a terminal is `{ id, title, cwd, entries, pending }`,
`pending` being its own prompt. `lastCommand` records the `:` line, while `cwd` and `declaredTerminal`
carry where a command would run and what the exercise's machine prints — never executed.

A terminal is a **leaf**, so focus, split, zoom, resize, swap and close work on a session with no
special case; zoom and the two session flags sit beside the tree, so they never change a layout.

## Actions

`WORKSPACE_ACTIONS` (window, tab, workspace), `WORKSPACE_FILE_ACTIONS`, `WORKSPACE_PICKER_ACTIONS`,
`WORKSPACE_EDIT_ACTIONS`, `WORKSPACE_TERMINAL_ACTIONS` and `WORKSPACE_SESSION_ACTIONS` hold the names
this engine applies. Every action returns `{ state, applied, reason? }`, never throws, and a refusal
returns the state it was handed with its reason.

| Action                                          | Does                                                        | Refuses when                                      |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `window.split-side-by-side`, `split-stacked`    | splits the focused window at 0.5, both panes keeping it     | the focus path reaches no leaf                    |
| `window.close`                                  | closes the focused window, focus to its sibling's last leaf | the tab holds one window                          |
| `window.focus-left/right/up/down`               | crosses the nearest split of the matching layout            | no such split on the focus path                   |
| `window.resize-wider/narrower/taller/shorter`   | steps that split's ratio by 0.05                            | already at the 0.1 or 0.9 bound                   |
| `window.enter-resize-mode`, `leave-resize-mode` | sets `mode`, keeping what was resized                       | already in that mode                              |
| `window.zoom`                                   | stores `{ tabId, focus }`; clears it when zoomed            | nothing is focused                                |
| `window.swap`                                   | exchanges the focused window with its nearest sibling       | the tab holds one window                          |
| `window.new`                                    | opens `options.path` in a new pane beside the focused one   | no path (no application is launched), or off disk |
| `tab.new`                                       | a new tab on the active buffer, taking the keys             | no active tab                                     |
| `tab.next`, `tab.previous`                      | cycles tabs; accepted and unchanged with one tab            | —                                                 |
| `workspace.switch`                              | selects `options.tabId`, or cycles without one              | no tab named `options.tabId`                      |
| `workspace.move`                                | moves the focused window into `options.tabId`               | no tab given, that one, or a single-window source |
| `file.open`                                     | focuses the buffer already showing that path, else opens    | no path, or the path is off the disk: E484        |
| `file.new`                                      | an empty buffer for a path the disk does not have yet       | no path, the file exists, a buffer has it open    |
| `file.save`                                     | writes the active buffer to the disk, clears `modified`     | a terminal has the keys, or nothing changed       |
| `file.close-buffer`                             | unloads the active buffer; panes re-point to a neighbour    | a terminal has the keys, or it is the last buffer |
| `buffer.next`, `buffer.previous`                | cycles buffers in open order, wrapping                      | fewer than two buffers are open                   |
| `file.find`                                     | opens the first file in path order holding the query        | no query, or no file matches                      |
| `grep.project`                                  | records the matching rows in `matches`; opens nothing       | no query, or no line matches                      |
| `buffer.list`                                   | focuses the open buffer `options.path` names                | no path, or no buffer is open for it              |
| `edit.insert`                                   | types `options.text` at the cursor, leaving NORMAL          | a terminal has the keys, no text, or empty text   |
| `app.launch-terminal`                           | a new session in a new pane beside the focused window       | the exercise declares no terminal                 |
| `shell.run`                                     | appends the declared output for `options.command`           | no command, no terminal focused, or none declared |
| `session.detach`, `session.attach`              | sets `detached`; nothing is closed, copied or restored      | —                                                 |

A split shows the focused window's content in both panes (a terminal split is one session shown twice)
while the buffer stays registered once. A picker action is a deterministic, case-insensitive substring
query, never a ranked picker (S6). Each `app.launch-terminal` opens its own session, and
`workspace.move` keeps the keys in the source tab and drops a zoom on the window that left.

## The `:` command line and the terminal prompt

`:` in NORMAL mode opens the command line: printable keys and Backspace edit it, Esc drops it, Enter
runs it, and an empty line runs nothing. It accepts exactly `:e <path>`, `:w`, `:bn`, `:bp` and `:ls`,
refusing anything else with Vim's own `E492`. A focused terminal has a prompt instead, with the same
keys: an empty Enter is refused by name, and each session keeps its own line.

Both are front ends only: they call the functions the actions call (`src/files.ts`,
`runInFocusedTerminal`), so a typed command and its action cannot reach two different states.

## Printing

`layoutText` prints the shape (`leaf`, `side(a, b)`, `stacked(a, b)`), `focusLeafIndex` the focused
leaf's index, `splitRatios` every ratio, `windowPaths` what each leaf shows (a path, or
`terminal:<title>`), `zoomedPath` the zoomed window or `null`, `focusedTerminalOutput` the scrollback,
`null` when a file has the keys, `workspaceObjectiveView` all of them plus files, buffer texts and
rows. Content quotes what a printer produces, so it never restates them in a second grammar.

## Invariants a caller may rely on

- `activeBufferId` follows the focused leaf, so `:e`, `:bn`, `:bp` and `file.close-buffer` move focus
  and buffer together; a terminal leaf has no buffer, so focusing one leaves the active buffer alone.
- A refused operation returns the state it was given, unchanged and the same object.
- Every operation is total and deterministic: nothing throws, an unknown action or key is refused, and
  the same inputs give the same state — no clock, no randomness, no I/O.
- The state gates every action first (T7a2). `detached` accepts only `session.detach` and
  `session.attach`, so nothing is lost; resize mode accepts only the four resizes,
  `window.enter-resize-mode`, `window.leave-resize-mode` and `session.detach`. The terminal prompt
  asks that gate under `shell.run`'s name; the `:` line is parsed keys, not an action.

## Try it

```ts
import * as ws from "@tutor-nvim/workspace-engine";
const state = ws.createWorkspace({ files: { "a.ts": "x" }, path: "a.ts", cwd: "/p" });
const { state: split, applied } = ws.applyWorkspaceAction(state, "window.split-stacked");
const view = ws.workspaceObjectiveView(split); // applied: true
view.layout; // "stacked(leaf, leaf)"; view.focus is 1, view.windowPaths ["a.ts", "a.ts"]
```

`pnpm vitest run packages/workspace-engine` runs the per-action oracle tests, the command-line parity
tests, the invariant suites that run after every step of two scripted sessions, and determinism.
