import { describe, expect, it } from "vitest";
import { parseKeymapLayers } from "@tutor-nvim/exercise-schema";

import { catalogFor } from "./resolve";
import { cheapestAction, planActionSolutions } from "./actions";

const layer = (id: string, prefix: string, keys: string) => `
schemaVersion: 1
id: ${id}
label: "${id}"
owns: [multiplexer]
prefix: "${prefix}"
bindings:
  - keys: "${keys}"
    action: window.split-side-by-side
    description: "Split side by side."
`;

const catalogsOf = (...yaml: readonly string[]) =>
  catalogFor(
    parseKeymapLayers(yaml.map((text, index) => ({ path: "layer-" + String(index) + ".yaml", text }))),
  );

const split = { action: "window.split-side-by-side" as const, classification: "optimal" as const };

describe("planning an action solution into the keys of each enabled layer (S6)", () => {
  it("keeps one candidate per layer that provides the action, cheapest first", () => {
    const catalogs = catalogFor(
      parseKeymapLayers([
        {
          path: "a.yaml",
          text: `
schemaVersion: 1
id: nvim
label: "Neovim"
owns: [editor]
bindings:
  - keys: "C-wv"
    action: window.split-side-by-side
    description: "Split right."
`,
        },
        { path: "b.yaml", text: layer("tmux", "C-b", "%") },
        { path: "c.yaml", text: layer("herdr", "C-b", "v") },
      ]),
    );
    const planned = planActionSolutions([split], catalogs);
    // `C-wv` is Ctrl-w then v: the notation applies a modifier to one key, so Neovim costs two too.
    expect(planned.map((candidate) => [candidate.layerId, candidate.keys])).toEqual([
      ["nvim", ["C-w", "v"]],
      ["tmux", ["C-b", "%"]],
      ["herdr", ["C-b", "v"]],
    ]);
    // What the keys cost is what the strategy classification compares; equal costs keep order.
    expect(planned.map((candidate) => candidate.cost)).toEqual([2, 2, 2]);
  });

  it("has no candidate when no enabled layer provides the action", () => {
    expect(planActionSolutions([split], catalogsOf(layer("herdr", "C-b", "v")))).toHaveLength(1);
    const catalogs = catalogsOf(layer("tmux", "C-b", "%"));
    expect(cheapestAction("file.save", catalogs)).toBeUndefined();
  });
});
