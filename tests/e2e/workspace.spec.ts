import { expect, test, type Page } from "@playwright/test";
import { currentExercise, editor, pressSolution, solveOrSkip } from "./helpers";

/** A story whose whole solution is actions no layer has to carry a target for (T8). */
const LAUNCH_TERMINAL = "neovim.terminal.launch.001";

/** A story whose first action names a path, which no catalog binding can say. */
const OPEN_FILE = "neovim.files.open.by-name-001";

const PREFS_KEY = "tutor-nvim:prefs";

/**
 * Turns tool layers on the way the layer rail does, before the app reads its preferences: the
 * catalogs are what make an action pressable, and nothing else about the session changes because no
 * exercise declares the layers it needs.
 */
async function enableLayers(page: Page, layers: readonly string[]): Promise<void> {
  await page.addInitScript(
    ([key, ids]) => {
      const stored = window.localStorage.getItem(key);
      const prefs = stored === null ? {} : JSON.parse(stored);
      window.localStorage.setItem(key, JSON.stringify({ ...prefs, enabledLayers: ids }));
    },
    [PREFS_KEY, [...layers]] as const,
  );
}

test.describe("T8 the workspace practice area as the suite sees it", () => {
  test("one locator finds the practice area of any kind, in English", async ({ page }) => {
    await page.goto(`/?exercise=${OPEN_FILE}`);

    // The area the vim and shell flows already use is the workspace one too: panes, not a notice.
    await expect(editor(page)).toBeFocused();
    await expect(page.getByRole("application", { name: "Workspace practice area" })).toBeFocused();
    await expect(page.getByTestId("workspace-panes")).toBeVisible();
    await expect(page.getByRole("region", { name: "Pane 1 of 1" })).toBeVisible();
    // The slug is the story asked for: free practice falls back to the first exercise otherwise.
    expect((await currentExercise(page)).slug).toBe(OPEN_FILE);
  });

  test("one locator finds the practice area of any kind, in Spanish", async ({ page }) => {
    // A clean browser is Spanish (ADR-0005), so this is the label a Spanish learner reads.
    await page.context().clearCookies();
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto(`/?exercise=${LAUNCH_TERMINAL}`);

    await expect(editor(page)).toBeFocused();
    await expect(
      page.getByRole("application", { name: "Zona de práctica del espacio de trabajo" }),
    ).toBeFocused();
    expect((await currentExercise(page)).slug).toBe(LAUNCH_TERMINAL);
  });

  test("practises a workspace story whose actions the learner's layers reach", async ({ page }) => {
    // Omarchy's Super-Enter is the one catalog row in the repository whose action needs no target.
    await enableLayers(page, ["omarchy"]);
    await page.goto(`/?exercise=${LAUNCH_TERMINAL}`);
    const exercise = await currentExercise(page);

    await pressSolution(page, exercise);
    // Solved with the declared optimal route: one action, no hints, so the panel says so.
    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-strategy")).toHaveText("Optimal");
    // And the workspace the action produced is on screen: the file beside the session, keys moved.
    const panes = page.getByTestId("workspace-pane");
    await expect(panes).toHaveCount(2);
    await expect(panes.nth(0).getByTestId("workspace-pane-label")).toHaveText("src/main.ts");
    await expect(panes.nth(1).getByTestId("workspace-pane-label")).toHaveText("terminal:shell");
    await expect(panes.nth(1)).toHaveAttribute("data-focused", "true");
    await expect(page.getByTestId("workspace-surface")).toHaveText("TERMINAL");
    await expect(page.getByTestId("workspace-actions")).toHaveText("1 action");
  });

  test("refuses to fake a press: a story whose actions carry a target is skipped, not typed", async ({
    page,
  }) => {
    // With the layers on, a binding exists for `file.open` — and it cannot say *which* file, so
    // pressing it would be refused by the engine instead of opening src/util.ts.
    await enableLayers(page, ["nvim", "lazyvim"]);
    await page.goto(`/?exercise=${OPEN_FILE}`);

    const { exercise, skipped } = await solveOrSkip(page);

    expect(exercise.kind).toBe("workspace");
    expect(skipped).toContain("file.open");
    expect(skipped).toContain("src/util.ts");
    // The attempt ends the way a learner who does not know it does, and nothing was pressed: the
    // engine recorded no action, and the buffer is the one the story started with.
    await expect(page.getByTestId("result-outcome")).toHaveText("NOT SOLVED");
    await expect(page.getByTestId("workspace-actions")).toHaveText("0 actions");
    await expect(page.getByTestId("workspace-pane-label")).toHaveText("src/main.ts");
  });
});
