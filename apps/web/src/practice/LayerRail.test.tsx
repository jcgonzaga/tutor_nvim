// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { parseKeymapLayers, type Exercise } from "@tutor-nvim/exercise-schema";
import { contentFor } from "../exercises";
import { keymapLayers } from "../keymaps";
import { I18nProvider } from "../i18n/I18nProvider";
import { DEFAULT_PREFS, PREFS_KEY } from "../prefs/prefs";
import { PrefsProvider } from "../prefs/PrefsProvider";
import { memoryStorage } from "../storage/profileStore";
import { LayerRail } from "./LayerRail";
import { PracticeScreen } from "./PracticeScreen";

afterEach(cleanup);

const en = contentFor("en");
const exercise = en.exercises.find((candidate) => candidate.kind === "vim")!;

/** The layer rail read from the real catalogs of content/keymaps, with a chosen enabled set. */
function storageWith(enabledLayers: readonly string[]) {
  const storage = memoryStorage();
  storage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, language: "en", enabledLayers }));
  return storage;
}

const inApp = (storage: ReturnType<typeof memoryStorage>, node: ReactNode) => (
  <PrefsProvider storage={storage}>
    <I18nProvider>{node}</I18nProvider>
  </PrefsProvider>
);

const switchFor = (label: string) => screen.getByRole("switch", { name: label });
const capsOf = (element: HTMLElement) =>
  [...element.querySelectorAll("[data-keycap]")].map((node) => node.textContent);
const rowLayers = () =>
  screen.queryAllByTestId("cost-row").map((row) => row.getAttribute("data-layer"));

/** Two catalogs whose split bindings cost different numbers of keys, for the ranking. */
const syntheticLayers = parseKeymapLayers([
  {
    path: "near.yaml",
    text: `
schemaVersion: 1
id: near
label: "Near"
owns: [editor]
prefix: "C-a"
bindings:
  - keys: "%"
    action: window.split-side-by-side
    description: "Split side by side."
`,
  },
  {
    path: "far.yaml",
    text: `
schemaVersion: 1
id: far
label: "Far"
owns: [multiplexer]
bindings:
  - keys: "x"
    action: window.split-side-by-side
    description: "Split side by side."
`,
  },
]);

describe("the layer rail lists the catalogs content has, and remembers the choice (S1)", () => {
  it("shows one switch per catalog in content, not a hardcoded list", () => {
    render(inApp(storageWith([]), <LayerRail events={[]} exercise={exercise} />));

    // The switch announces the surface in the learner's language, exactly like the visible line.
    const surfaces = { shell: "shell", editor: "editor", multiplexer: "multiplexer", "window-manager": "window manager" } as const;
    expect(screen.getAllByRole("switch").map((node) => node.getAttribute("aria-label"))).toEqual(
      keymapLayers.map(
        (layer) =>
          `${layer.label}, ${layer.owns.map((surface) => surfaces[surface]).join(", ")}`,
      ),
    );
    expect(screen.getByTestId("rail-count").textContent).toBe(`0 of ${keymapLayers.length} on`);
  });

  it("turns a layer on, saves it immediately, and a reload still shows it on", () => {
    const storage = storageWith([]);
    const first = render(inApp(storage, <LayerRail events={[]} exercise={exercise} />));
    expect(switchFor("Neovim, editor").getAttribute("aria-checked")).toBe("false");

    fireEvent.click(switchFor("Neovim, editor"));

    expect(switchFor("Neovim, editor").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("rail-count").textContent).toBe(`1 of ${keymapLayers.length} on`);
    expect(JSON.parse(storage.getItem(PREFS_KEY) ?? "{}").enabledLayers).toEqual(["nvim"]);

    first.unmount();
    render(inApp(storage, <LayerRail events={[]} exercise={exercise} />));
    expect(switchFor("Neovim, editor").getAttribute("aria-checked")).toBe("true");
  });
});

describe("the cost table compares the same action across the enabled layers (S6)", () => {
  it("lists the enabled layers in capture order with their keys and cost", () => {
    // Enabled in reverse on purpose: the focused surface (editor) still comes first.
    render(inApp(storageWith(["tmux", "nvim"]), <LayerRail events={[]} exercise={exercise} />));

    expect(rowLayers()).toEqual(["nvim", "tmux"]);
    const [nvim, tmux] = screen.getAllByTestId("cost-row");
    expect(capsOf(nvim!)).toEqual(["C-w", "v"]);
    expect(within(nvim!).getByTestId("cost-cost").textContent).toBe("2 keys");
    expect(capsOf(tmux!)).toEqual(["C-b", "%"]);
    expect(within(tmux!).getByTestId("cost-cost").textContent).toBe("2 keys");
  });

  it("marks every layer at the minimum cost as optimal, ties included", () => {
    render(inApp(storageWith(["nvim", "tmux"]), <LayerRail events={[]} exercise={exercise} />));

    for (const row of screen.getAllByTestId("cost-row")) {
      expect(within(row).getByTestId("cost-rank").textContent).toBe("optimal");
      expect(within(row).getByTestId("cost-rank").getAttribute("data-optimal")).toBe("true");
    }
  });

  it("marks only the cheapest layer when the costs differ", () => {
    render(
      inApp(
        storageWith(["far", "near"]),
        <LayerRail events={[]} exercise={exercise} layers={syntheticLayers} />,
      ),
    );

    expect(rowLayers()).toEqual(["near", "far"]);
    const [near, far] = screen.getAllByTestId("cost-row");
    expect(within(near!).getByTestId("cost-rank").textContent).toBe("valid");
    expect(within(near!).getByTestId("cost-rank").getAttribute("data-optimal")).toBe("false");
    expect(within(far!).getByTestId("cost-rank").textContent).toBe("optimal");
    expect(within(far!).getByTestId("cost-cost").textContent).toBe("1 key");
  });

  it("uses the action the exercise asks for, or the split example when it declares none", () => {
    const first = render(
      inApp(storageWith(["nvim"]), <LayerRail events={[]} exercise={exercise} />),
    );
    expect(screen.getByTestId("cost-action").textContent).toBe("window.split-side-by-side");
    expect(screen.getByTestId("cost-example")).toBeTruthy();
    first.unmount();

    const asked: Exercise = {
      ...exercise,
      actionSolutions: [{ action: "window.split-side-by-side", classification: "optimal" }],
    };
    render(inApp(storageWith(["nvim"]), <LayerRail events={[]} exercise={asked} />));
    expect(screen.getByTestId("cost-action").textContent).toBe("window.split-side-by-side");
    expect(screen.queryByTestId("cost-example")).toBeNull();
  });

  it("says so when no enabled layer provides the action", () => {
    // Linux owns the shell, and the shell has no split binding.
    render(inApp(storageWith(["linux"]), <LayerRail events={[]} exercise={exercise} />));

    expect(screen.queryAllByTestId("cost-row")).toEqual([]);
    expect(screen.getByTestId("cost-empty").textContent).toBe(
      "No active layer offers window.split-side-by-side.",
    );
  });
});

describe("the indicator names the layer that owns the next key, and never changes the attempt (S5)", () => {
  it("names the enabled layer that claims the key, and keeps the pending sequence", () => {
    render(inApp(storageWith(["nvim"]), <PracticeScreen exercise={exercise} />));
    const editor = screen.getByRole("application");

    expect(screen.getByTestId("key-owner").textContent).toContain("Press a key");

    fireEvent.keyDown(editor, { key: "w", code: "KeyW", ctrlKey: true });
    expect(screen.getByTestId("key-owner").textContent).toBe("The next key belongs to Neovim.");
    expect(capsOf(screen.getByTestId("owner-keys"))).toEqual(["C-w"]);

    fireEvent.keyDown(editor, { key: "v", code: "KeyV" });
    expect(screen.getByTestId("key-owner").textContent).toBe("The next key belongs to Neovim.");
    expect(capsOf(screen.getByTestId("owner-keys"))).toEqual(["C-w", "v"]);
  });

  it("says nobody claims a key no enabled layer knows, keeping the pending sequence visible", () => {
    render(inApp(storageWith(["nvim"]), <PracticeScreen exercise={exercise} />));
    const editor = screen.getByRole("application");

    fireEvent.keyDown(editor, { key: "w", code: "KeyW", ctrlKey: true });
    fireEvent.keyDown(editor, { key: "Q", code: "KeyQ", shiftKey: true });

    expect(screen.getByTestId("key-owner").textContent).toBe("No active layer claims it.");
    expect(capsOf(screen.getByTestId("owner-keys"))).toEqual(["C-w"]);
  });

  it("claims nothing while no layer is enabled, but the practice keeps working", () => {
    render(inApp(storageWith([]), <PracticeScreen exercise={exercise} />));
    const editor = screen.getByRole("application");

    fireEvent.keyDown(editor, { key: "h", code: "KeyH" });

    expect(screen.getByTestId("key-owner").textContent).toBe("No active layer claims it.");
    // Label only: the keystroke still reached the engine and was counted.
    expect(screen.getByTestId("keystroke-count").textContent).toBe("1 key");
  });
});
