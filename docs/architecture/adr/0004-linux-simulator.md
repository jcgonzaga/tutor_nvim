# ADR-0004: Linux simulator (PRD phase 9)

Status: accepted and implemented (engine M10-A; integration M10-B). Decisions taken with the product
owner: Linux exercises are mixed into the daily session with Vim, and the first Linux skill is open
from the start.

## Context

PRD phase 9 adds basic Linux commands to the same skill, mastery and review framework as Vim
(IMPLEMENTATION_PLAN section 13, P1). AGENTS.md section 3 excludes real Linux containers from the MVP
and says to keep deterministic, testable evaluation (2.5) and framework-free engines (2.3). A
simulator satisfies both; a container does not (non-deterministic, server-side, needs a security
review: plan P3).

## Decision: a pure `packages/shell-engine`

Same shape as `vim-engine`: `(state, key) -> state`, no React, no I/O, no clock, no globals.

- **Virtual file system** (`fs.ts`): immutable tree of files and directories with permission bits.
  No symlinks, other users or timestamps; what is not modelled is absent, not faked. `ls -l` shows a
  fixed owner and date.
- **Shell language** (`parse.ts`, `expand.ts`): words with `'…'`, `"…"` and `\`; `$VAR`, `${VAR}`,
  `$?`, `~`; globs `*` and `?`; `|`, `;`, `&&`, `||`; `<`, `>`, `>>`; `NAME=value` and `export`.
  Anything else (`&`, `$(…)`, backticks, subshells, here-documents, braces) is rejected with a
  message instead of being guessed at.
- **Commands**: `pwd ls cd mkdir touch cp mv rm cat echo chmod grep find wc head tail sort true
false`. Flags are the commonly taught ones (`ls -alR1d`, `mkdir -pv`, `cp -r`, `rm -rf`,
  `grep -invcrlEFwHh`, `find -name -iname -type -maxdepth -mindepth`, `chmod` octal and symbolic with
  `-R`). `less` is deferred (needs an interactive pager state); running a script only checks the
  execute bit.
- **Terminal input** (`keys.ts`): printable keys build the line, Backspace edits, Enter runs, Up/Down
  browse history, Ctrl+U clears, Ctrl+C abandons. Tab completion and in-line cursor movement are
  not simulated yet.
- **Determinism**: names are sorted in byte order (`LC_ALL=C`), `find` walks in sorted order, no
  time is read.

## Why we can trust it: a real-bash oracle

Like the Vim engine, the simulator is checked against the real thing instead of memory.
`oracle.test.ts` runs 44 scenarios (268 command lines) in real bash with GNU coreutils 9.4 in a
throw-away directory and compares, for every line, the output (stdout and stderr merged) and the exit
status, and at the end the whole file tree with modes and contents. The first run exposed differences
in `cp` messages, `ls ..` link counts, empty unquoted expansions, `${}` parsing, missing `true`/`false`
and variable assignment; all are fixed. Root ignores permission bits, so when the tests run as root
bash runs as `nobody` inside the sandbox. Scenarios that bash itself aborts on (syntax errors) are
covered by unit tests with the exact messages instead.

Known, deliberate differences: `ls` always prints one entry per line (as bash does when piped);
`find` order is sorted (GNU find uses directory order); dates are fixed; `ls -l` block totals use
ext4 rules.

## Integration (as built; see m10-linux-simulator.md)

1. **Exercise schema**: a discriminated `kind: "vim" | "shell"`. A shell exercise has an initial tree
   (`files`, `cwd`), and goals such as `fs_matches` (files that must exist/not exist, content, mode),
   `cwd_equals`, `last_output_contains`. Solutions are command lines, executed in CI like Vim ones
   (AGENTS.md section 10).
2. **Evaluation**: attempts and telemetry generalise from keys to terminal keys (same event shape);
   strategy by declared solutions and keystroke efficiency; shell anti-patterns: a command failing
   again and again, `cd ..` chains instead of one path, `rm -r` with a wildcard.
3. **Server**: the API replays shell attempts with the same engine, exactly as for Vim.
4. **Web**: a terminal view on the existing practice screen, with the same keyboard capture.
5. **Content**: 8 Linux skills and 48 exercises with prerequisites in the same graph; the root skill
   is open from the start and the daily session mixes Vim and the shell.
