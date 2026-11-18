import { describe, expect, it } from "vitest";
import { parseKeymapLayers } from "@tutor-nvim/exercise-schema";
import { catalogFor } from "@tutor-nvim/keymap";

import { readKeymapInput } from "../../../scripts/content-fs";
import { evaluateActionAttempt } from "./action-attempt";

/**
 * S6 against the real catalogs, not fixtures: the same declared action is solved by every layer that
 * provides it, which is the whole reason an exercise names the action instead of one tool's keys.
 */
/** The enabled layers in the learner's order: content order is alphabetical, enabling order is not. */
const catalogs = (...ids: readonly string[]) => {
  const parsed = parseKeymapLayers(readKeymapInput());
  const byId = new Map(parsed.map((layer) => [layer.id, layer] as const));
  return catalogFor(ids.flatMap((id) => byId.get(id) ?? []));
};

const press = (key: string, ctrl = false) => ({
  key,
  ctrl,
  alt: false,
  shift: false,
  meta: false,
  mode: "normal" as const,
});

const split = { action: "window.split-side-by-side", classification: "optimal" } as const;

describe("the real catalogs solve one declared action (S6)", () => {
  it("solves it with tmux, with Herdr and with Neovim, each at two keys", () => {
    for (const [id, events] of [
      ["tmux", [press("b", true), press("%")]],
      ["herdr", [press("b", true), press("v")]],
      ["nvim", [press("w", true), press("v")]],
    ] as const) {
      const result = evaluateActionAttempt({ actionSolutions: [split] }, events, catalogs(id));
      expect(result).toMatchObject({
        kind: "action",
        success: true,
        solvedBy: { layerId: id, cost: 2 },
        cheapestCost: 2,
      });
    }
  });

  it("gives a shared C-b to the layer enabled first: tmux wins it before Herdr", () => {
    // Recorded as a known consequence in odd/tasks/keymap-layers.md (L6, L9), not a defect here.
    const keys = [press("b", true), press("v")];
    expect(
      evaluateActionAttempt({ actionSolutions: [split] }, keys, catalogs("tmux", "herdr")),
    ).toMatchObject({ success: false, solvedBy: null });
    expect(
      evaluateActionAttempt({ actionSolutions: [split] }, keys, catalogs("herdr", "tmux")),
    ).toMatchObject({ success: true, solvedBy: { layerId: "herdr" } });
  });
});
