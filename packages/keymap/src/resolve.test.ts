import { describe, expect, it } from "vitest";
import { parseKeymapLayers } from "@tutor-nvim/exercise-schema";

import {
  IDLE_KEYMAP_STATE,
  captureOrder,
  catalogFor,
  resolveKeymapKey,
  type KeymapState,
} from "./resolve";

const layer = (yaml: string) => yaml;

const NVIM = layer(`
schemaVersion: 1
id: nvim
label: "Neovim"
owns: [editor]
bindings:
  - keys: "h"
    action: motion.char-left
    description: "Move one character left."
    modes: [normal]
  - keys: "x"
    action: edit.delete-char
    description: "Delete the character under the cursor."
    modes: [normal]
`);

const TMUX = layer(`
schemaVersion: 1
id: tmux
label: "tmux"
owns: [multiplexer]
prefix: "C-b"
bindings:
  - keys: "%"
    action: window.split-side-by-side
    description: "Split side by side."
  - keys: "v"
    action: window.split-stacked
    description: "Split stacked."
`);

const OMARCHY_TMUX = layer(`
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
`);

const LAZYVIM = layer(`
schemaVersion: 1
id: lazyvim
label: "LazyVim"
owns: [editor]
extends: [nvim]
leader: "Space"
bindings:
  - keys: "ff"
    action: file.find
    description: "Find files."
    modes: [normal]
`);

/** The real content input shape: one file per catalog. */
const catalogs = (...sources: readonly string[]) =>
  catalogFor(
    parseKeymapLayers(
      sources.map((text, index) => ({ path: "layer-" + String(index) + ".yaml", text })),
    ),
  );

/** Presses every key in order, returning the outcomes and the state it ends in. */
function press(start: KeymapState, keys: readonly string[], cat: ReturnType<typeof catalogs>) {
  const outcomes = [];
  let state = start;
  for (const key of keys) {
    const outcome = resolveKeymapKey(state, key, cat);
    outcomes.push(outcome);
    state = outcome.state;
  }
  return { outcomes, state, last: outcomes[outcomes.length - 1] };
}

describe("resolving a key against the enabled layers (S5)", () => {
  it("resolves a direct key of the layer that owns it", () => {
    const cat = catalogs(NVIM);
    const outcome = resolveKeymapKey(IDLE_KEYMAP_STATE, "h", cat);
    expect(outcome.kind).toBe("action");
    expect(outcome.kind === "action" && [outcome.layerId, outcome.action]).toEqual([
      "nvim",
      "motion.char-left",
    ]);
    // A completed binding leaves nothing pending.
    expect(outcome.state).toEqual(IDLE_KEYMAP_STATE);
  });

  it("keeps a prefix open and resolves the key pressed after it", () => {
    const cat = catalogs(TMUX);
    const { outcomes, last } = press(IDLE_KEYMAP_STATE, ["C-b", "%"], cat);
    expect(outcomes[0]?.kind).toBe("pending");
    expect(outcomes[0]?.state).toEqual({ layerId: "tmux", keys: ["C-b"] });
    expect(last?.kind === "action" && last.action).toBe("window.split-side-by-side");
    expect(last?.state).toEqual(IDLE_KEYMAP_STATE);
  });

  it("reports a key that no enabled layer claims as not accepted", () => {
    const cat = catalogs(NVIM, TMUX);
    const outcome = resolveKeymapKey(IDLE_KEYMAP_STATE, "Q", cat);
    expect(outcome).toMatchObject({ kind: "not-accepted", key: "Q" });
    expect(outcome.state).toEqual(IDLE_KEYMAP_STATE);
  });

  it("reports a key that breaks an open prefix as not accepted and closes it", () => {
    const cat = catalogs(TMUX);
    const { last } = press(IDLE_KEYMAP_STATE, ["C-b", "Q"], cat);
    expect(last).toMatchObject({ kind: "not-accepted", key: "Q" });
    expect(last?.state).toEqual(IDLE_KEYMAP_STATE);
  });

  it("asks the focused surface first: the same prefix belongs to whichever layer is in front", () => {
    const nvimFirst = captureOrder(
      parseKeymapLayers([
        { path: "nvim.yaml", text: NVIM },
        { path: "tmux.yaml", text: TMUX },
      ]),
      "editor",
    );
    expect(nvimFirst.map((item) => item.id)).toEqual(["nvim", "tmux"]);
    const multiplexerFirst = captureOrder(
      parseKeymapLayers([
        { path: "nvim.yaml", text: NVIM },
        { path: "tmux.yaml", text: TMUX },
      ]),
      "multiplexer",
    );
    expect(multiplexerFirst.map((item) => item.id)).toEqual(["tmux", "nvim"]);

    // Two enabled layers that own the same surface resolve in the order they are given.
    const tmuxWins = resolveKeymapKey(IDLE_KEYMAP_STATE, "C-b", catalogs(TMUX, OMARCHY_TMUX));
    expect(tmuxWins.state.layerId).toBe("tmux");
    const omarchyWins = resolveKeymapKey(
      IDLE_KEYMAP_STATE,
      "C-Space",
      catalogs(TMUX, OMARCHY_TMUX),
    );
    expect(omarchyWins.state.layerId).toBe("tmux-omarchy");
  });

  it("resolves the leader layer's bindings after the leader and keeps inherited ones direct", () => {
    const cat = catalogs(NVIM, LAZYVIM);
    const { outcomes, last } = press(IDLE_KEYMAP_STATE, ["Space", "f", "f"], cat);
    expect(outcomes[0]?.state).toEqual({ layerId: "lazyvim", keys: ["Space"] });
    expect(outcomes[1]?.kind).toBe("pending");
    expect(last?.kind === "action" && last.action).toBe("file.find");

    // An inherited binding keeps the opener of the layer it came from, so h is still one key.
    const inherited = resolveKeymapKey(IDLE_KEYMAP_STATE, "h", cat);
    expect(inherited.kind === "action" && inherited.layerId).toBe("nvim");
  });

  it("lets an extending layer override an inherited binding without dropping the base layer", () => {
    const cat = catalogs(TMUX, OMARCHY_TMUX);
    const omarchy = press(IDLE_KEYMAP_STATE, ["C-Space", "v"], cat).last;
    expect(omarchy?.kind === "action" && omarchy.action).toBe("window.split-side-by-side");
    // tmux's own v is untouched on its own prefix, and so are the keys it alone has.
    const tmuxV = press(IDLE_KEYMAP_STATE, ["C-b", "v"], cat).last;
    expect(tmuxV?.kind === "action" && tmuxV.action).toBe("window.split-stacked");
    const inherited = press(IDLE_KEYMAP_STATE, ["C-Space", "%"], cat).last;
    expect(inherited?.kind === "action" && inherited.action).toBe("window.split-side-by-side");
  });

  it("only matches a binding in the modes it declares", () => {
    const cat = catalogs(NVIM);
    expect(resolveKeymapKey(IDLE_KEYMAP_STATE, "h", cat).kind).toBe("action");
    const inInsert = resolveKeymapKey(IDLE_KEYMAP_STATE, "h", cat, { mode: "insert" });
    expect(inInsert).toMatchObject({ kind: "not-accepted", key: "h" });
  });

  it("never guesses: a half-typed binding nobody continues stops being pending", () => {
    const cat = catalogs(NVIM, LAZYVIM);
    const { last } = press(IDLE_KEYMAP_STATE, ["Space", "f", "h"], cat);
    expect(last).toMatchObject({ kind: "not-accepted", key: "h" });
    expect(last?.state).toEqual(IDLE_KEYMAP_STATE);
  });
});
