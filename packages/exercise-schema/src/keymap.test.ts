import { describe, expect, it } from "vitest";
import {
  ExerciseValidationError,
  KEYMAP_ACTIONS,
  KEYMAP_TEXT_ACTIONS,
  parseKeymapLayer,
  validateKeymapLayers,
  type KeymapBindingInput,
  type KeymapLayerInput,
} from "./index";

/**
 * The tmux row of the frozen schema in `odd/tasks/keymap-layers.md`, minus the optional keys, with
 * the "Vocabulary v2" split action (decision 1).
 */
function validLayer(): KeymapLayerInput {
  return {
    schemaVersion: 1,
    id: "tmux",
    label: "tmux",
    owns: ["multiplexer"],
    prefix: "C-b",
    bindings: [
      {
        keys: "%",
        action: "window.split-side-by-side",
        description: "Split the pane side by side.",
      },
    ],
  };
}

function binding(overrides: Partial<KeymapBindingInput> = {}): KeymapBindingInput {
  return { keys: "ff", action: "file.find", description: "Find a file.", ...overrides };
}

function layer(id: string, overrides: Partial<KeymapLayerInput> = {}): KeymapLayerInput {
  return {
    ...validLayer(),
    id,
    label: id,
    owns: ["editor"],
    prefix: undefined,
    bindings: [binding()],
    ...overrides,
  };
}

function issuesFor(input: unknown): readonly string[] {
  try {
    parseKeymapLayer(input);
  } catch (error) {
    if (error instanceof ExerciseValidationError) return error.issues;
    throw error;
  }
  throw new Error("expected the keymap layer to be rejected");
}

const source = (index: number): string => `content/keymaps/${index}.yaml`;

/** Runs the collection rules over already-parsed layers, which is what `parseKeymapLayers` does last. */
function collectionIssuesFor(inputs: readonly KeymapLayerInput[]): readonly string[] {
  return validateKeymapLayers(
    inputs.map((input, index) => ({
      layer: parseKeymapLayer(input, source(index)),
      source: source(index),
    })),
  );
}

describe("keymap layer schema v1", () => {
  it("parses the frozen tmux example and applies defaults", () => {
    expect(parseKeymapLayer(validLayer())).toEqual({
      schemaVersion: 1,
      id: "tmux",
      label: "tmux",
      owns: ["multiplexer"],
      extends: [],
      prefix: "C-b",
      bindings: [
        {
          keys: "%",
          action: "window.split-side-by-side",
          description: "Split the pane side by side.",
          modes: [],
          override: false,
        },
      ],
    });
  });

  it("keeps modes, override and notModelled when a layer declares them", () => {
    const layer = parseKeymapLayer({
      ...validLayer(),
      leader: " ",
      bindings: [
        binding({ modes: ["normal", "visual"], override: true }),
        binding({ keys: "Tab", action: "shell.complete", notModelled: "no completion yet" }),
      ],
    });
    expect(layer.leader).toBe(" ");
    expect(layer.bindings[0]).toEqual({
      keys: "ff",
      action: "file.find",
      description: "Find a file.",
      modes: ["normal", "visual"],
      override: true,
    });
    expect(layer.bindings[1]?.notModelled).toBe("no completion yet");
  });

  it("rejects a schema version other than 1", () => {
    expect(issuesFor({ ...validLayer(), schemaVersion: 2 }).join("\n")).toContain(
      "schemaVersion: must be 1",
    );
    const missing = validLayer() as Record<string, unknown>;
    delete missing.schemaVersion;
    expect(issuesFor(missing).join("\n")).toContain("schemaVersion");
  });

  it("rejects a malformed id", () => {
    expect(issuesFor({ ...validLayer(), id: "Tmux Layer" }).join("\n")).toContain(
      'id: must be lowercase letters, digits and "-", starting with a letter',
    );
    expect(issuesFor({ ...validLayer(), id: "3tmux" }).join("\n")).toContain("id:");
  });

  it("rejects an unknown surface", () => {
    expect(issuesFor({ ...validLayer(), owns: ["pane"] }).join("\n")).toContain(
      "owns.0: Invalid option: expected one of",
    );
  });

  it("rejects an unknown mode", () => {
    const input = validLayer();
    input.bindings = [binding({ modes: ["emacs"] as never })];
    expect(issuesFor(input).join("\n")).toContain(
      "bindings.0.modes.0: Invalid option: expected one of",
    );
  });

  it("rejects an unknown action", () => {
    const input = validLayer();
    // `pane.zoom` is what the ADR sketches; v1 calls it `window.zoom`.
    input.bindings = [binding({ action: "pane.zoom" as never })];
    expect(issuesFor(input).join("\n")).toContain(
      "bindings.0.action: Invalid option: expected one of",
    );
  });

  it('names the split actions by the layout they produce, not by "horizontal"', () => {
    for (const action of ["window.split-side-by-side", "window.split-stacked"]) {
      const input = validLayer();
      input.bindings = [binding({ action: action as never })];
      expect(parseKeymapLayer(input).bindings[0]?.action).toBe(action);
    }
    expect(KEYMAP_ACTIONS).not.toContain("window.split-horizontal");
    expect(KEYMAP_ACTIONS).not.toContain("window.split-vertical");
    for (const action of ["window.split-horizontal", "window.split-vertical"]) {
      const input = validLayer();
      input.bindings = [binding({ action: action as never })];
      expect(issuesFor(input).join("\n")).toContain(
        "bindings.0.action: Invalid option: expected one of",
      );
    }
  });

  it("parses motion and edit bindings", () => {
    const input = validLayer();
    input.bindings = [
      binding({ keys: "w", action: "motion.word-forward" }),
      binding({ keys: "i", action: "edit.insert-before" }),
    ];
    expect(parseKeymapLayer(input).bindings.map((item) => item.action)).toEqual([
      "motion.word-forward",
      "edit.insert-before",
    ]);
  });

  it("accepts a target for the three editing actions that take one", () => {
    const input = validLayer();
    input.bindings = [
      binding({ keys: 'ci"', action: "edit.change", target: "inner-quotes" }),
      binding({ keys: "dd", action: "edit.delete", target: "line" }),
      binding({ keys: "yy", action: "edit.yank", target: "inner-word" }),
    ];
    expect(parseKeymapLayer(input).bindings.map((item) => item.target)).toEqual([
      "inner-quotes",
      "line",
      "inner-word",
    ]);
  });

  it("rejects a target on an action that takes none, naming the action and the allowed set", () => {
    const input = validLayer();
    input.bindings = [binding({ action: "file.open", target: "word" as never })];
    expect(issuesFor(input).join("\n")).toContain(
      'bindings.0.target: "file.open" takes no target: only edit.delete, edit.change, edit.yank do',
    );
  });

  it("rejects a target outside the target vocabulary", () => {
    const input = validLayer();
    input.bindings = [binding({ action: "edit.delete", target: "around-word" as never })];
    expect(issuesFor(input).join("\n")).toContain(
      "bindings.0.target: Invalid option: expected one of",
    );
  });

  it("rejects an empty label, bindings or description", () => {
    expect(issuesFor({ ...validLayer(), label: "" }).join("\n")).toContain(
      "label: Too small: expected string to have >=1 characters",
    );
    expect(issuesFor({ ...validLayer(), bindings: [] }).join("\n")).toContain(
      "bindings: Too small: expected array to have >=1 items",
    );
    const input = validLayer();
    input.bindings = [binding({ description: "" })];
    expect(issuesFor(input).join("\n")).toContain(
      "bindings.0.description: Too small: expected string to have >=1 characters",
    );
  });

  it("rejects keys outside the notation", () => {
    const unfinished = issuesFor({ ...validLayer(), bindings: [binding({ keys: "C-" })] });
    expect(unfinished.join("\n")).toContain(
      'bindings.0.keys: "C-" is not written in the key notation',
    );
    expect(unfinished.join("\n")).toContain(
      "a named key (Enter, Esc, Space, Tab, Left, Right, Up, Down)",
    );
    const control = issuesFor({ ...validLayer(), bindings: [binding({ keys: "\u001b" })] });
    expect(control.join("\n")).toContain("bindings.0.keys: ");
  });
});

describe("keymap layer catalog", () => {
  it("rejects a duplicate id", () => {
    expect(collectionIssuesFor([layer("tmux"), layer("tmux")])).toEqual([
      'duplicate keymap layer id "tmux" in content/keymaps/1.yaml (first defined in content/keymaps/0.yaml)',
    ]);
  });

  it("rejects extends pointing at an unknown layer", () => {
    expect(collectionIssuesFor([layer("lazyvim", { extends: ["nvim"] })])).toEqual([
      'content/keymaps/0.yaml: layer lazyvim extends unknown layer "nvim"',
    ]);
  });

  it("rejects an extends cycle", () => {
    expect(
      collectionIssuesFor([
        layer("nvim", { extends: ["lazyvim"] }),
        layer("lazyvim", { extends: ["nvim"] }),
      ]).join("\n"),
    ).toContain("extends cycle: nvim -> lazyvim -> nvim");
  });

  it("rejects an inherited (keys, modes) pair repeated without override", () => {
    const base = layer("nvim", { bindings: [binding({ modes: ["normal"] })] });
    const child = layer("lazyvim", {
      extends: ["nvim"],
      bindings: [binding({ modes: ["normal"], description: "Mine now." })],
    });
    expect(collectionIssuesFor([base, child])).toEqual([
      'content/keymaps/1.yaml: layer lazyvim repeats inherited binding "ff" in modes normal (from content/keymaps/0.yaml); set override: true',
    ]);
  });

  it("accepts an inherited pair repeated with override: true", () => {
    const base = layer("nvim", { bindings: [binding({ modes: ["normal"] })] });
    const child = layer("lazyvim", {
      extends: ["nvim"],
      bindings: [binding({ modes: ["normal"], override: true })],
    });
    expect(collectionIssuesFor([base, child])).toEqual([]);
  });
});

describe("the action that types text (workspace stories 1 and 6)", () => {
  it("names edit.insert in the vocabulary, as the only action a solution gives a text", () => {
    expect(KEYMAP_ACTIONS).toContain("edit.insert");
    expect(KEYMAP_TEXT_ACTIONS).toEqual(["edit.insert"]);
    for (const action of KEYMAP_TEXT_ACTIONS) expect(KEYMAP_ACTIONS).toContain(action);
  });
});
