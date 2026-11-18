import { describe, expect, it } from "vitest";
import { parseKeymapLayers } from "@tutor-nvim/exercise-schema";

import { IDLE_KEYMAP_STATE, catalogFor } from "./resolve";
import { traceKeymapActions } from "./trace";

/** The real content input shape: one file per catalog. */
const catalogsOf = (...sources: readonly string[]) =>
  catalogFor(
    parseKeymapLayers(
      sources.map((text, index) => ({ path: "layer-" + String(index) + ".yaml", text })),
    ),
  );

const TMUX = `
schemaVersion: 1
id: tmux
label: "tmux"
owns: [multiplexer]
prefix: "C-b"
bindings:
  - keys: "%"
    action: window.split-side-by-side
    description: "Split side by side."
  - keys: '"'
    action: window.split-stacked
    description: "Split stacked."
`;

/** Herdr shares tmux's prefix but not its keys (keymap-layers.md L4). */
const HERDR = `
schemaVersion: 1
id: herdr
label: "Herdr"
owns: [multiplexer]
prefix: "C-b"
bindings:
  - keys: "v"
    action: window.split-side-by-side
    description: "Split side by side."
`;

const NVIM = `
schemaVersion: 1
id: nvim
label: "Neovim"
owns: [editor]
bindings:
  - keys: "h"
    action: motion.char-left
    description: "Move one character left."
    modes: [normal]
  - keys: "C-wv"
    action: window.split-side-by-side
    description: "Split right."
    modes: [normal]
`;

/** Omarchy ships tmux with `C-Space`: the inherited bindings open with it too (L6). */
const OMARCHY_TMUX = `
schemaVersion: 1
id: tmux-omarchy
label: "tmux (Omarchy)"
owns: [multiplexer]
extends: [tmux]
prefix: "C-Space"
bindings:
  - keys: "v"
    action: window.split-side-by-side
    description: "Split side by side."
    override: true
`;

/** Only the fields a caller reads to decide an attempt; the binding itself is asserted apart. */
const summarised = (trace: ReturnType<typeof traceKeymapActions>) =>
  trace.actions.map((action) => ({
    action: action.action,
    layerId: action.layerId,
    sourceId: action.sourceId,
    keys: [...action.keys],
    cost: action.cost,
    tokenIndex: action.tokenIndex,
  }));

describe("replaying a recorded key sequence through the resolver (S6)", () => {
  it("completes the same action with tmux's keys and with Herdr's own binding", () => {
    const tmux = traceKeymapActions(["C-b", "%"], catalogsOf(TMUX));
    expect(summarised(tmux)).toEqual([
      {
        action: "window.split-side-by-side",
        layerId: "tmux",
        sourceId: "tmux",
        keys: ["C-b", "%"],
        cost: 2,
        tokenIndex: 0,
      },
    ]);

    const herdr = traceKeymapActions(["C-b", "v"], catalogsOf(HERDR));
    expect(summarised(herdr)).toEqual([
      {
        action: "window.split-side-by-side",
        layerId: "herdr",
        sourceId: "herdr",
        keys: ["C-b", "v"],
        cost: 2,
        tokenIndex: 0,
      },
    ]);
  });

  it("reports the source binding, not the opener the resolver glued to its keys", () => {
    const [completed] = traceKeymapActions(["C-b", "%"], catalogsOf(TMUX)).actions;
    expect(completed?.binding.keys).toBe("%");
    expect(completed?.binding.action).toBe("window.split-side-by-side");
  });

  it("traces Neovim's own split keys", () => {
    // `C-wv` is Ctrl-w then v: the notation applies a modifier to one key.
    expect(summarised(traceKeymapActions(["C-w", "v"], catalogsOf(NVIM)))).toEqual([
      {
        action: "window.split-side-by-side",
        layerId: "nvim",
        sourceId: "nvim",
        keys: ["C-w", "v"],
        cost: 2,
        tokenIndex: 0,
      },
    ]);
  });

  it("credits an inherited binding to the layer it was written in", () => {
    const trace = traceKeymapActions(["C-Space", '"'], catalogsOf(TMUX, OMARCHY_TMUX));
    expect(summarised(trace)).toEqual([
      {
        action: "window.split-stacked",
        layerId: "tmux-omarchy",
        sourceId: "tmux",
        keys: ["C-Space", '"'],
        cost: 2,
        tokenIndex: 0,
      },
    ]);
  });

  it("completes nothing for a sequence that binds no action", () => {
    const trace = traceKeymapActions(["C-b", "x"], catalogsOf(TMUX));
    expect(trace.actions).toEqual([]);
  });

  it("reports an unclaimed key instead of inventing an action, and keeps replaying", () => {
    // `x` breaks the open `C-b` sequence, so the resolver closes it and starts again from rest.
    const trace = traceKeymapActions(["C-b", "x", "C-b", "%"], catalogsOf(TMUX));
    expect(trace.unclaimed).toEqual([{ tokenIndex: 1, key: "x" }]);
    expect(summarised(trace)).toEqual([
      {
        action: "window.split-side-by-side",
        layerId: "tmux",
        sourceId: "tmux",
        keys: ["C-b", "%"],
        cost: 2,
        tokenIndex: 2,
      },
    ]);
  });

  it("reports a lone unclaimed key and leaves the resolver at rest", () => {
    const trace = traceKeymapActions(["x"], catalogsOf(TMUX));
    expect(trace.actions).toEqual([]);
    expect(trace.unclaimed).toEqual([{ tokenIndex: 0, key: "x" }]);
    expect(trace.state).toEqual(IDLE_KEYMAP_STATE);
  });

  it("never invents an action from a sequence that is still open", () => {
    expect(traceKeymapActions([], catalogsOf(TMUX)).actions).toEqual([]);
    const pending = traceKeymapActions(["C-b"], catalogsOf(TMUX));
    expect(pending.actions).toEqual([]);
    expect(pending.unclaimed).toEqual([]);
    expect(pending.state).toEqual({ layerId: "tmux", keys: ["C-b"] });
  });

  it("resolves in the mode it is given", () => {
    expect(traceKeymapActions(["h"], catalogsOf(NVIM)).actions).toHaveLength(1);
    const insert = traceKeymapActions(["h"], catalogsOf(NVIM), { mode: "insert" });
    expect(insert.actions).toEqual([]);
    expect(insert.unclaimed).toEqual([{ tokenIndex: 0, key: "h" }]);
  });

  it("takes each token's mode from modeAt, because a recorded attempt changes mode", () => {
    // The same key, twice: in INSERT nothing claims it, in NORMAL it moves one character left.
    const modes = ["insert", "normal"] as const;
    const trace = traceKeymapActions(["h", "h"], catalogsOf(NVIM), {
      modeAt: (tokenIndex) => modes[tokenIndex] ?? "normal",
    });
    expect(summarised(trace)).toEqual([
      {
        action: "motion.char-left",
        layerId: "nvim",
        sourceId: "nvim",
        keys: ["h"],
        cost: 1,
        tokenIndex: 1,
      },
    ]);
    expect(trace.unclaimed).toEqual([{ tokenIndex: 0, key: "h" }]);
  });
});
