// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { parseWorkspaceExercise } from "@tutor-nvim/exercise-schema";
import { contentFor } from "../exercises";
import { I18nProvider } from "../i18n/I18nProvider";
import { DEFAULT_PREFS, PREFS_KEY } from "../prefs/prefs";
import { PrefsProvider } from "../prefs/PrefsProvider";
import { memoryStorage } from "../storage/profileStore";
import { FreePractice } from "../FreePractice";
import { PracticeScreen } from "./PracticeScreen";

afterEach(cleanup);

const en = contentFor("en");
/** A vim exercise with hints, so the give-up control has its usual block around it. */
const exercise = en.exercises.find(
  (candidate) => candidate.kind === "vim" && candidate.hints.length > 0,
)!;

function inEnglish(node: ReactNode) {
  const storage = memoryStorage();
  storage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, language: "en" }));
  return (
    <PrefsProvider storage={storage}>
      <I18nProvider>{node}</I18nProvider>
    </PrefsProvider>
  );
}

/** The same screen with the tool layers a learner enabled: the workspace view resolves keys with them. */
function inEnglishWithLayers(node: ReactNode, enabledLayers: readonly string[]) {
  const storage = memoryStorage();
  storage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, language: "en", enabledLayers }));
  return (
    <PrefsProvider storage={storage}>
      <I18nProvider>{node}</I18nProvider>
    </PrefsProvider>
  );
}

const giveUp = () => screen.getByRole("button", { name: "I don't know this" });
const retry = () => screen.getByRole("button", { name: "Try again" });

describe("free practice: an exercise the learner cannot solve", () => {
  it("offers a way to say so, and ends the attempt as not solved", () => {
    render(inEnglish(<FreePractice slug={exercise.slug} />));
    expect(screen.queryByTestId("result")).toBeNull();

    fireEvent.click(giveUp());

    expect(screen.getByTestId("result-outcome").textContent).toBe("NOT SOLVED");
  });

  it("lets the learner redo the same exercise from scratch", () => {
    render(inEnglish(<FreePractice slug={exercise.slug} />));
    fireEvent.click(giveUp());

    fireEvent.click(retry());

    expect(screen.queryByTestId("result")).toBeNull();
    expect(screen.getByTestId("keystroke-count").textContent).toBe("0 keys");
    expect(giveUp()).toBeTruthy();
  });
});

/** A workspace exercise: two files on the disk and a window to split (T8). */
const workspace = parseWorkspaceExercise({
  schemaVersion: 1,
  kind: "workspace",
  id: "workspace-screen-001",
  slug: "workspace.screen.split-001",
  title: "Split the window",
  instruction: "Split the window side by side.",
  skillIds: ["vim.navigation.atomic"],
  mode: "learn",
  difficulty: 1,
  initialState: {
    files: { "src/main.ts": "one", "src/other.ts": "two" },
    path: "src/main.ts",
    cwd: "/project",
  },
  objective: {
    type: "all",
    goals: [
      { type: "layout", text: "side(leaf, leaf)" },
      { type: "focus", leaf: 1 },
    ],
  },
  solutions: [{ actions: ["window.split-side-by-side"], classification: "optimal" }],
});

/** A workspace exercise whose story happens at a terminal prompt (T7a3, story 19). */
const terminalWorkspace = parseWorkspaceExercise({
  schemaVersion: 1,
  kind: "workspace",
  id: "workspace-screen-002",
  slug: "workspace.screen.terminal-001",
  title: "Run the suite in a terminal",
  instruction: "Open a terminal and run the tests.",
  skillIds: ["vim.navigation.atomic"],
  mode: "learn",
  difficulty: 1,
  initialState: {
    files: { "src/main.ts": "one" },
    path: "src/main.ts",
    cwd: "/project",
    terminal: { title: "shell", commands: { "npm test": ["ok 3 tests"] } },
  },
  objective: { type: "terminal_output", lines: ["ok 3 tests"] },
  solutions: [
    {
      actions: ["app.launch-terminal", { action: "shell.run", command: "npm test" }],
      classification: "optimal",
    },
  ],
});

const application = () => screen.getByRole("application");

/**
 * A workspace exercise is a chunk of its own (the practice screen lazy-loads the view so the vim and
 * shell screens do not pay for it), so every workspace test starts by waiting for the panes.
 */
async function show(exercise: Parameters<typeof PracticeScreen>[0]["exercise"], layers: string[]) {
  render(inEnglishWithLayers(<PracticeScreen exercise={exercise} />, layers));
  await screen.findByTestId("workspace-panes");
}
const panes = () => screen.getAllByTestId("workspace-pane");
const focusedPanes = () => panes().map((pane) => pane.getAttribute("data-focused") === "true");

/** One key press in the practice area, the way the browser reports it. */
function press(
  key: string,
  modifiers: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey", true>> = {},
) {
  fireEvent.keyDown(application(), { key, code: `Key${key.toUpperCase()}`, ...modifiers });
}

describe("the practice screen and a workspace exercise", () => {
  it("draws the panes the engine holds, instead of a notice about a view that does not exist", async () => {
    await show(workspace, ["nvim"]);

    expect(screen.queryByTestId("workspace-notice")).toBeNull();
    expect(screen.getByTestId("workspace-panes")).toBeTruthy();
    expect(panes().length).toBe(1);
    expect(focusedPanes()).toEqual([true]);
    // One pane, the file it shows, and the text that file holds through the existing editor view.
    expect(screen.getByTestId("workspace-pane-label").textContent).toBe("src/main.ts");
    expect(screen.getByTestId("buffer").textContent).toContain("one");
    // The useful state is in words beside the panes, never only in the colour of a ring.
    expect(screen.getByTestId("workspace-mode").textContent).toBe("NORMAL");
    expect(screen.getByTestId("workspace-session").textContent).toContain("attached");
    expect(screen.getByTestId("workspace-focus").textContent).toContain("Pane 1 of 1");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(workspace.instruction);
  });

  it("moves the focus when a key an enabled layer claims reaches an action", async () => {
    await show(workspace, ["nvim"]);

    // nvim's `C-w v` splits the window side by side: a key the layer claims, resolved to an action.
    press("w", { ctrlKey: true });
    press("v");

    expect(panes().length).toBe(2);
    expect(focusedPanes()).toEqual([false, true]);
    // The split is what the objective asks for, so the attempt ended by itself.
    await waitFor(() => expect(screen.getByTestId("result-outcome").textContent).toBe("SUCCESS"));
  });

  it("types into the focused buffer when no layer claims the key", async () => {
    await show(workspace, ["nvim"]);

    // `i` is a layer binding the workspace does not apply, and `Z` is a key no layer claims: both
    // reach the buffer through the engine, so a learner can still edit text.
    press("i");
    press("Z", { shiftKey: true });

    await waitFor(() => expect(screen.getByTestId("buffer").textContent).toContain("Zone"));
  });

  it("shows what was typed at the focused terminal's prompt", async () => {
    await show(terminalWorkspace, ["omarchy"]);

    // Omarchy opens a terminal beside the window; the new pane has the keys (T7a1).
    press("Enter", { metaKey: true });
    expect(panes().length).toBe(2);
    expect(focusedPanes()).toEqual([false, true]);

    press("n");
    press("p");
    press("m");

    await waitFor(() =>
      expect(screen.getByTestId("workspace-terminal-prompt").textContent).toBe("npm"),
    );
  });

  it("runs the line the learner typed at the prompt, and shows what it printed", async () => {
    await show(terminalWorkspace, ["omarchy"]);
    press("Enter", { metaKey: true });

    for (const key of ["n", "p", "m", " ", "t", "e", "s", "t"]) press(key);
    fireEvent.keyDown(application(), { key: "Enter", code: "Enter" });

    await waitFor(() =>
      expect(screen.getByTestId("workspace-terminal-output").textContent).toBe("ok 3 tests"),
    );
    expect(screen.getByTestId("workspace-terminal").textContent).toContain("npm test");
    expect(screen.getByTestId("workspace-terminal-prompt").textContent).toBe("");
    expect(screen.getByTestId("result-outcome").textContent).toBe("SUCCESS");
  });
});
