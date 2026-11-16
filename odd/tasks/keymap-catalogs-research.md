# Keymap catalogs — sourced research (T1b/T2 evidence)

Read-only research behind `content/keymaps/*.yaml`. Every row is justified by the tool's own
documentation; anything unverifiable is listed at the bottom instead of being modelled. Vocabulary and
naming decisions live in `keymap-layers.md` ("Vocabulary v2"), not here.

Repo fact that bounds everything: there is **no multiplexer and no window-manager engine** today
(`packages/workspace-engine` does not exist), so every tmux/omarchy binding, and every nvim buffer or
window command, needs `notModelled` until M12-A lands.

## tmux — `owns: [multiplexer]`, `prefix: "C-b"`

Source: `key-bindings.c#key_bindings_init`, <https://github.com/tmux/tmux/blob/master/key-bindings.c>

| keys | action | description (tmux's own wording) |
| --- | --- | --- |
| `%` | `window.split-side-by-side` | Split window horizontally (panes side by side) |
| `"` | `window.split-stacked` | Split window vertically (one above the other) |
| `Up` / `Down` / `Left` / `Right` | `window.focus-up` / `-down` / `-left` / `-right` | Select pane in that direction |
| `z` | `window.zoom` | Zoom the active pane |
| `x` | `window.close` | Kill the active pane (asks for confirmation) |
| `c` | `tab.new` | Create a new window |
| `n` / `p` | `tab.next` / `tab.previous` | Select next / previous window |
| `d` | `session.detach` | Detach the current client |

Left out on purpose (real bindings, no vocabulary yet): `o` (next pane), `;` (last pane), `w`
(choose-tree), `,` (rename window), `[` (copy mode), `0`-`9`, `s`, `{`/`}`. See gaps.

## tmux-omarchy — `extends: [tmux]`, `prefix: "C-Space"`

Omarchy ships its own tmux configuration: prefix `Ctrl + Space` (`Ctrl + B` also works), splits on
`v` and `h`, plus its own `x`, `z`, `c`, `k`, `r`, `[`. Consequence: the upstream defaults above are
wrong on an Omarchy box, which is why this is a second layer that overrides, not an edit of the first.
Sources: Omarchy's manual, <https://omarchy.org/manual/hotkeys/> and its shipped tmux config.

## omarchy — `owns: [window-manager]`, no prefix

Source: Omarchy's own manual, section "Navigating", <https://omarchy.org/manual/hotkeys/>

| keys | action | manual row |
| --- | --- | --- |
| `Super-Return` | `app.launch-terminal` | `Super + Return` → Terminal |
| `Super-q`, `Super-w` | `window.close` | `Super + W` or `Super + Q` → Close window |
| `Super-Left/Right/Up/Down` | `window.focus-left/right/up/down` | Move focus in that direction |
| `Super-Shift-Left/Right/Up/Down` | `window.swap` | Swap window with another |
| `Super-Tab` | `workspace.switch` | Next workspace on this monitor |
| `Super-1`…`Super-4` | `workspace.switch` | Jump to workspace N |
| `Super-f` | `window.zoom` | Go full screen |

Left out: the resize chords. Omarchy has no resize submap; resizing is `Super+Minus`/`Super+Equal`,
bound to *physical key codes* (`code:20`/`code:21`) whose characters differ per layout (US `-`/`=`,
ES `'`/`¡`). The `keys` notation has no key-code form, and guessing a character would violate
AGENTS.md 2.9. This is a notation gap, recorded, not a binding.

## nvim — `owns: [editor]`

Source: Neovim's own help (`:help h`, `:help w`, `:help d`, `:help i_<Esc>`, `:help windows.txt`,
`:help editing.txt`, and the rest of the cited pages).

Modeled subset, executable today by `packages/vim-engine` (its `MOTIONS`, `TEXT_OBJECTS` and
`stepNormal` were read to confirm): `h j k l w b e W B E 0 ^ $ f t ; ,`, `i a o Esc`, `d c y dd yy cw`,
`iw i" a" i( a( i{ a{`, `x p P u C-r .`.

Not modelled (`vim-engine` has one buffer and one window and parses no Ex command line):

| keys | action | source |
| --- | --- | --- |
| `:e` | `file.open` | `editing.txt` `:e[dit] {file}` |
| `:w` | `file.save` | `editing.txt` `:w[rite]` |
| `:ls` | `buffer.list` | `windows.txt` `:ls` |
| `:bn` / `:bp` | `buffer.next` / `buffer.previous` | `windows.txt` `:bn[ext]`, `:bp[revious]` |
| `C-wv` | `window.split-side-by-side` | `windows.txt` `:vsplit` |
| `C-ws` | `window.split-stacked` | `windows.txt` `:split` |
| `C-wh/j/k/l` | `window.focus-left/down/up/right` | `windows.txt` section 4 |
| `C-wq` | `window.close` | `windows.txt` `CTRL-W q` |

## Vocabulary and notation gaps found

- No action yet for: `window.focus-next` (tmux `o`), `window.focus-last` (tmux `;`), `tab.list`
  (tmux `w`), `tab.rename` (tmux `,`), `tab.select` (tmux `0`-`9`), `copy-mode.enter` (tmux `[`),
  `session.list` (tmux `s`), `window.equalize` / `window.close-others` (nvim), `buffer.select` /
  `buffer.alternate` (nvim `:b N`, `C-^`), `app.launch-editor` / `app.launch-browser` /
  `app.open-menu` (omarchy), `window.toggle-split` (omarchy `Super+J`), `workspace.next` /
  `workspace.previous` / `workspace.select-N`.
- Notation: no named key for `-`, `=`, `\`` yet, and `keys` is a *sequence* — a literal space is a
  key, so write `C-wh` and never `C-w h`.
- `modes` has no value for "after the tmux prefix": leave `modes` empty and rely on `prefix`.

## Not verified

- tmux's man page text itself was not opened; defaults come from `key-bindings.c` on `master`, the
  source the man page describes. Older releases may differ slightly.
- Omarchy's `config/hypr/bindings.conf` was not read (fetch aborted); the manual is the source used,
  so exact `bind` lines and the current version number are unconfirmed.
- Whether Omarchy *unbinds* tmux's `%`/`"` or only shadows them was not confirmed.
