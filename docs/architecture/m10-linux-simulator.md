# M10 — Linux simulator: architecture notes

Status: **M10-A (the engine) is implemented and tested. Integration into exercises, evaluation, API
and UI is proposed in [ADR-0004](adr/0004-linux-simulator.md) and has not been started.**

`packages/shell-engine` is a framework-free simulator of a small Linux shell over an in-memory file
system; see the ADR for scope, design and what is deliberately not modelled.

```ts
import { initShell, typeCommand, dispatchShellKey } from "@tutor-nvim/shell-engine";

let state = initShell({ files: { "project/src/app.js": "const API_URL = 1;\n" } });
state = typeCommand(state, "grep -r API_URL project");
state.transcript.at(-1)?.output; // "project/src/app.js:const API_URL = 1;\n"
```

## Verification

- 24 unit tests (parsing, prompt, history, Ctrl+C, subshell `cd`, determinism, input rejection).
- 44 oracle scenarios (268 command lines) against real bash (see the ADR); they skip themselves where bash or GNU
  coreutils are not available (non-Linux).
- Typecheck and lint clean; no dependencies.

## Not done yet

- Exercise kind `shell`, goals on the file system, evaluation and anti-patterns, server replay,
  terminal UI, content and mastery wiring (ADR section "Proposed integration").
- `less`, Tab completion, in-line cursor movement, `sed`/`awk`/`uniq`/`diff`, symlinks, scripts.
