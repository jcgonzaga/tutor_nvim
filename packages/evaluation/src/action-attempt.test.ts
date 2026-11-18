import { describe, expect, it } from "vitest";
import { parseKeymapLayers, type ActionSolution } from "@tutor-nvim/exercise-schema";
import { catalogFor } from "@tutor-nvim/keymap";

import { evaluateActionAttempt, type ActionAttemptEvaluation, type RecordedInput } from "./action-attempt";
import { DEFAULT_STRATEGY_CONFIG } from "./strategy";

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
  - keys: "C-wv"
    action: window.split-side-by-side
    description: "Split right."
    modes: [normal]
`;

/** A layer that spends 7 keys on the stacked split: prefix plus six. */
const SLOW = `
schemaVersion: 1
id: slow
label: "Slow"
owns: [multiplexer]
prefix: "C-b"
bindings:
  - keys: "abcdef"
    action: window.split-stacked
    description: "Split stacked, expensively."
`;

/** A layer that spends one key on the same action: what "cheapest" compares against. */
const ONE_KEY = `
schemaVersion: 1
id: one-key
label: "One key"
owns: [multiplexer]
bindings:
  - keys: "%"
    action: window.split-side-by-side
    description: "Split side by side with one key."
`;

const split: ActionSolution = { action: "window.split-side-by-side", classification: "optimal" };
const stacked: ActionSolution = { action: "window.split-stacked", classification: "optimal" };

/** One recorded input, as an attempt's `InputEvent` carries it. */
const press = (
  key: string,
  options: { ctrl?: boolean; mode?: "normal" | "insert" | "shell" } = {},
): RecordedInput => ({
  key,
  ctrl: options.ctrl === true,
  alt: false,
  shift: false,
  meta: false,
  mode: options.mode ?? "normal",
});

/** A recorded key sequence in catalog notation: `C-b` is Ctrl-b, `%` is the character itself. */
const typed = (...tokens: readonly string[]): readonly RecordedInput[] =>
  tokens.map((token) =>
    token.startsWith("C-") ? press(token.slice(2), { ctrl: true }) : press(token),
  );

/** Narrows to the action half, so a "not an action exercise" answer cannot pass by accident. */
const solved = (evaluation: ActionAttemptEvaluation) => {
  if (evaluation.kind !== "action") {
    throw new Error(`expected an action exercise, got ${evaluation.kind}`);
  }
  return evaluation;
};

describe("deciding an action attempt (S6)", () => {
  it("solves the same exercise with tmux's keys and with Herdr's own binding", () => {
    const exercise = { actionSolutions: [split] };

    const tmux = solved(evaluateActionAttempt(exercise, typed("C-b", "%"), catalogsOf(TMUX)));
    expect(tmux.success).toBe(true);
    expect(tmux.solvedBy).toMatchObject({
      layerId: "tmux",
      sourceId: "tmux",
      action: "window.split-side-by-side",
      keys: ["C-b", "%"],
      cost: 2,
      eventIndex: 0,
    });

    const herdr = solved(evaluateActionAttempt(exercise, typed("C-b", "v"), catalogsOf(HERDR)));
    expect(herdr.success).toBe(true);
    expect(herdr.solvedBy).toMatchObject({ layerId: "herdr", keys: ["C-b", "v"], cost: 2 });
  });

  it("solves it with Neovim's own keys, at the cheapest cost any enabled layer charges", () => {
    const evaluation = solved(
      evaluateActionAttempt(
        { actionSolutions: [split] },
        typed("C-w", "v"),
        catalogsOf(NVIM, TMUX, HERDR),
      ),
    );
    expect(evaluation.solvedBy).toMatchObject({ layerId: "nvim", keys: ["C-w", "v"], cost: 2 });
    // All three layers charge two keys, so the attempt sits on the cheapest cost there is.
    expect(evaluation.cheapestCost).toBe(2);
    expect(evaluation.keystrokes).toBe(2);
    expect(evaluation.classification).toBe("optimal");
  });

  it("compares the cost with the cheapest layer, not with the layer the learner used", () => {
    // Neovim still charges two keys, but another enabled layer does the same in one: 1/2.
    const evaluation = solved(
      evaluateActionAttempt(
        { actionSolutions: [split] },
        typed("C-w", "v"),
        catalogsOf(NVIM, ONE_KEY),
      ),
    );
    expect(evaluation.solvedBy).toMatchObject({ layerId: "nvim", cost: 2 });
    expect(evaluation.cheapestCost).toBe(1);
    expect(evaluation.classification).toBe("valid");
  });

  it("does not solve an exercise whose declared action the sequence never performs", () => {
    const evaluation = solved(
      evaluateActionAttempt({ actionSolutions: [stacked] }, typed("C-b", "%"), catalogsOf(TMUX)),
    );
    expect(evaluation.success).toBe(false);
    expect(evaluation.performed).toEqual([]);
    expect(evaluation.solvedBy).toBeNull();
    expect(evaluation.cheapestCost).toBeNull();
    expect(evaluation.classification).toBe("failed");
  });

  it("creates no action from an unclaimed key", () => {
    const exercise = { actionSolutions: [split] };
    for (const events of [typed("C-b", "x"), typed("x"), typed("x", "C-b")]) {
      const evaluation = solved(evaluateActionAttempt(exercise, events, catalogsOf(TMUX)));
      expect(evaluation.performed).toEqual([]);
      expect(evaluation.success).toBe(false);
    }
  });

  it("does not perform a NORMAL-only binding for a key that arrived in INSERT", () => {
    const evaluation = solved(
      evaluateActionAttempt(
        { actionSolutions: [split] },
        [press("w", { ctrl: true, mode: "insert" }), press("v", { mode: "insert" })],
        catalogsOf(NVIM),
      ),
    );
    expect(evaluation.performed).toEqual([]);
    expect(evaluation.classification).toBe("failed");
  });

  it("reports an exercise with no action solutions as not an action exercise", () => {
    const events = typed("C-b", "%");
    // Not a failure: the exercise never asked for an action, so this decides nothing about it.
    expect(evaluateActionAttempt({ actionSolutions: [] }, events, catalogsOf(TMUX))).toEqual({
      kind: "not-an-action-exercise",
    });
    expect(evaluateActionAttempt({}, events, catalogsOf(TMUX))).toEqual({
      kind: "not-an-action-exercise",
    });
  });

  it("classifies at the band boundaries, reusing the strategy bands", () => {
    const { optimal, efficient, valid } = DEFAULT_STRATEGY_CONFIG.efficiencyBands;
    expect([optimal, efficient, valid]).toEqual([1, 0.7, 0.4]);

    const stackedExercise = { actionSolutions: [stacked] };
    const atOptimal = solved(
      evaluateActionAttempt(
        stackedExercise,
        typed("C-b", "a", "b", "c", "d", "e", "f"),
        catalogsOf(SLOW),
      ),
    );
    // 7 keys spent, 7 the layer charges: exactly the optimal band.
    expect([atOptimal.keystrokes, atOptimal.cheapestCost]).toEqual([7, 7]);
    expect(atOptimal.classification).toBe("optimal");

    // 7/10: exactly the efficient band, and the three wasted keys are what lowered it.
    const atEfficient = solved(
      evaluateActionAttempt(
        stackedExercise,
        typed("q", "q", "q", "C-b", "a", "b", "c", "d", "e", "f"),
        catalogsOf(SLOW),
      ),
    );
    expect([atEfficient.keystrokes, atEfficient.cheapestCost]).toEqual([10, 7]);
    expect(atEfficient.classification).toBe("efficient");

    // 2/5: exactly the valid band.
    const atValid = solved(
      evaluateActionAttempt(
        { actionSolutions: [split] },
        typed("q", "q", "q", "C-b", "%"),
        catalogsOf(TMUX),
      ),
    );
    expect([atValid.keystrokes, atValid.cheapestCost]).toEqual([5, 2]);
    expect(atValid.classification).toBe("valid");

    // 2/6 falls under the last band.
    const belowValid = solved(
      evaluateActionAttempt(
        { actionSolutions: [split] },
        typed("q", "q", "q", "q", "C-b", "%"),
        catalogsOf(TMUX),
      ),
    );
    expect([belowValid.keystrokes, belowValid.cheapestCost]).toEqual([6, 2]);
    expect(belowValid.classification).toBe("inefficient");
  });

  it("reads the bands from the config it is given", () => {
    const evaluation = solved(
      evaluateActionAttempt(
        { actionSolutions: [stacked] },
        typed("q", "q", "q", "C-b", "a", "b", "c", "d", "e", "f"),
        catalogsOf(SLOW),
        { efficiencyBands: { optimal: 1, efficient: 0.9, valid: 0.4 } },
      ),
    );
    // 0.7 no longer reaches the raised efficient band, so it falls to the next one down.
    expect(evaluation.classification).toBe("valid");
  });
});
