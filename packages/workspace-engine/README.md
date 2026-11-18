# @tutor-nvim/workspace-engine

The simulated developer desktop (S2, S4): the files on a simulated disk, the open buffers, and the
window tree that shows them. Pure state and pure functions — no clock, no I/O, no globals, no React
(AGENTS.md 2.3), so a story is replayed in a test without a browser.

Two entry points, and the split between them is the design:

| Entry point                                     | What it owns                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `dispatchWorkspace(state, key)`                 | text and the `:` command line; editing keys go to `vim-engine` (`dispatch`) |
| `applyWorkspaceAction(state, action, options?)` | windows, tabs and the workspace; **never** keys                             |

Window operations are actions, not keys. The layer catalogs (`content/keymaps/*.yaml`) map a tool's
keys to an action name and `@tutor-nvim/keymap` resolves them, so tmux's `C-b %` and Herdr's `C-b v`
reach the same `window.split-side-by-side` and therefore the same state. This package does not know
what a prefix or a leader is, and does not depend on the keymap package.

## State

```ts
interface WorkspaceState {
  files: Record<string, string>; // the simulated disk
  cwd: string;
  buffers: WorkspaceBuffer[]; // open buffers, in opening order; each id appears once
  activeBufferId: string; // always the focused window's buffer
  tabs: WorkspaceTab[]; // one window tree per tab
  activeTabId: string;
  zoom: { tabId; leafPath } | null; // a note beside the tree, never a shape of it
  pending: PendingWorkspaceCommand | null;
  lastCommand: WorkspaceCommandResult | null;
}

type WindowNode =
  | { kind: "leaf"; bufferId: string }
  | {
      kind: "split";
      layout: "side-by-side" | "stacked";
      ratio: number;
      first: WindowNode;
      second: WindowNode;
    };
```

`focus` is the path from a tab's root to the focused leaf (`[]` is a tab of one window), and
`activeBufferId` follows it: focusing a window makes its buffer the active one, and `:e`, `:bn` and
`:bp` move both together.

## Actions

`window.split-side-by-side`, `window.split-stacked`, `window.close`, `window.focus-left/right/up/down`,
`window.resize-wider/narrower/taller/shorter`, `window.zoom`, `window.swap`, `window.new`, `tab.new`,
`tab.next`, `tab.previous`, `workspace.switch`.

Every action is total: it returns `{ state, applied, reason? }`, never throws, and an action that
cannot apply returns the state it was given — the same object — with a reason.

Rules the tests pin:

- **Split** shows the buffer the focused window already showed in both panes and focuses the new
  one. That is what tmux and nvim do (a split of one window duplicates the view); the buffer is
  still _registered_ once, and `:e` in either pane separates them.
- **Focus** follows the layout: a left/right key moves inside a `side-by-side` split, an up/down key
  inside a `stacked` one, walking outward through nested panes. A left/right key with only a stacked
  split on the focus path is refused with a reason.
- **Close** hands focus to the sibling's last leaf and refuses to close the last window. The closed
  window's buffer stays open, so `:bn` brings it back.
- **Resize** steps the ratio by 0.05 inside `[0.1, 0.9]`, on the nearest split of the matching
  layout, and refuses at the bound instead of clamping.
- **Zoom** stores `{ tabId, leafPath }`; pressing it again clears it. The tree is untouched, so a
  zoom whose window was closed is dropped rather than pointing at a pane that no longer exists.
- **Swap** exchanges the two leaves' buffers, leaving shape, ratios and focus alone.
- **`window.new`** opens `options.path` in a new pane; the simulation launches no applications, so
  without a path it is refused with a reason (`S6`), and an off-disk path gets `:e`'s `E484`.
- **`workspace.switch`** selects `options.tabId`, and cycles to the next tab when none is given.

## Tests

`src/actions.test.ts` holds the oracle tests (whole-state assertions per action), the invariant
suite that runs after every step of a scenario script (the focus path reaches a leaf,
`activeBufferId` is that leaf's buffer, every ratio inside `[0.1, 0.9]` with both children present,
no buffer registered twice, every leaf references an open buffer), and determinism.
`src/workspace.test.ts` is the T1 oracle suite and `src/workspace.regression.test.ts` the T1
purity/parity probes; both must keep passing untouched.
