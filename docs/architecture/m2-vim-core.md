# M2 — Vim core: architecture notes

Status: implemented. The MVP command subset from `AGENTS.md` §6 is supported and tested.

## Supported subset

| Family       | Commands                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| Modes        | NORMAL, INSERT (`Enter` splits the line; no Backspace/arrows)            |
| Motions      | `h j k l`, `0 ^ $`, `w W b B e E`, `f<c> t<c>`, `;` `,`                  |
| Insert entry | `i a o`, `Esc`                                                           |
| Operators    | `d c y`, doubled (`dd cc yy`), with any motion above (`dw`, `c$`, `yj`…) |
| Text objects | `iw`, `i"` `a"`, `i(` `a(`, `i{` `a{`                                    |
| Editing      | `x`, `p`, `P`, `u`, `Ctrl-r`, `.`                                        |

Not included on purpose (outside the subset): counts, `F`/`T`, `aw`, `ib`/`i)`/`i[`/`i<`, `gg`/`G`,
`O`/`A`/`I`, registers other than the unnamed one, visual mode, Backspace in INSERT.

## Grammar

One pipeline serves every operator:

```text
key ─► pending command ─► motion / text object ─► RawRange ─► Region ─► operator
        (operator,                                (start,end,   (char | line)
         text-object,                              inclusive,
         char-search)                              linewise)
```

- `motions.ts` returns a position plus a kind (`exclusive`, `inclusive`, `linewise`).
- `text-objects.ts` returns a `RawRange` directly.
- `regions.ts` normalizes a `RawRange` the way Vim does (`:help exclusive`): an exclusive range that
  ends in column 0 of a later line is pulled back to the previous line's end, or becomes linewise
  when it also starts in the indent. `engine.ts` additionally makes a multi-line charwise `d`
  linewise when it ends on blanks only (`op_delete`).
- Operators (`applyOperator`) work on a `Region` and never know which key produced it.

## Vim fidelity: the oracle

The word motions, `iw`, quotes and bracket objects are **ports of Vim's own algorithms**
(`fwd_word`, `end_word`, `current_quote`, `current_block`…), and the engine is checked against real
Vim rather than against our memory of it:

```text
pnpm vim:oracle          # needs `vim` and `python3`; regenerates src/oracle/vim-oracle.json
pnpm test                # CI: engine vs the committed fixtures (no Vim needed)
```

- `src/oracle/cases.ts` defines ~8,500 cases: exhaustive position × motion grids, operators ×
  motions × text objects, put/undo/redo/dot sequences, and 2,000 fixed-seed random sequences.
- `tools/vim-oracle/run_vim.py` drives an interactive Vim in a pty (real undo blocks, real `.`),
  runs every case until two runs agree, and reports buffer, cursor and unnamed register.
- `oracle.test.ts` requires the engine to end in the identical buffer, cursor and register.
- Fixtures come from Vim 9.1 (the version is stored in the JSON). Rerunning is incremental: only
  new or edited cases are executed.

The oracle found behaviour that is easy to get wrong from memory, now covered by tests:
`ci"` between two strings, block text objects that look ahead when the cursor is outside a block,
empty yanks emptying the register, linewise promotion of multi-line `d`, `p` with an empty register
creating an undo step and becoming the command `.` repeats, and the cursor after undo/redo.

## State and undo

- `VimState` adds `desiredColumn` (sticky column for `j`/`k`, `"end"` after `$`), the unnamed
  `register`, `charSearch` (for `;`/`,`), `undoStack`/`redoStack`, `insertSession` and `repeat`.
- **Undo is one step per command**; an INSERT session is one step together with the command that
  opened it (`ci"production<Esc>` is a single `u`). Each entry stores before/after buffers plus the
  cursor Vim would record and the first changed line, which is what undo and redo use to place the
  cursor.
- **`.` replays the recorded keys** of the last change (never motions, yanks, undo or redo). A
  replay is atomic: if any key is rejected, nothing changes, so the remaining typed text is never
  executed as commands.

## Known deviations from Vim

- After `cj`/`ck` (multi-line linewise change) + undo, Vim's cursor depends on which of several
  internal undo records was saved first; the engine does not model it and the fuzz avoids it.
- Vim ignores a further `dd` once `dd` has emptied the buffer; the engine deletes the remaining
  empty line and fills the register.
- Word classes treat non-ASCII letters/digits as keyword characters; Vim uses finer Unicode classes.
- Columns are UTF-16 code units and `j`/`k` use character columns, not display cells (tabs, wide
  characters).
- `accepted` follows Vim's beeps: for example `w` on the last character is not accepted, while the
  cursor still moves when Vim moves it.
