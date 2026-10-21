import { expect, test, type Page } from "@playwright/test";

const TARGET = 'const mode = "production";';

/** Opens the challenge and waits until the editor owns the keyboard, so no key is typed into the void. */
async function openChallenge(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("application", { name: "Vim practice editor" })).toBeFocused();
}

test.describe("M1 vertical practice slice", () => {
  test('completes the canonical `ci"` challenge with the optimal sequence', async ({ page }) => {
    await openChallenge(page);

    const buffer = page.getByTestId("buffer");
    const mode = page.getByTestId("vim-mode");

    await expect(page.getByText("Change only the text inside the quotes")).toBeVisible();
    await expect(buffer).toHaveText('const mode = "development";');
    await expect(mode).toHaveText("NORMAL");
    await expect(page.getByTestId("result")).toHaveCount(0);

    await page.keyboard.type('ci"production');
    await expect(mode).toHaveText("INSERT");
    await expect(buffer).toHaveText(TARGET);
    // Buffer already matches, but the goal requires finishing in NORMAL mode.
    await expect(page.getByTestId("result")).toHaveCount(0);

    await page.keyboard.press("Escape");

    await expect(buffer).toHaveText(TARGET);
    await expect(mode).toHaveText("NORMAL");

    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-strategy")).toHaveText("optimal");
    await expect(page.getByTestId("result-keystrokes")).toHaveText("14");
    await expect(page.getByTestId("result-first-input")).toHaveText(/^\d+ ms$/);
    await expect(page.getByTestId("result-duration")).toHaveText(/^\d+ ms$/);
  });

  test("a successful but unplanned route is valid, not optimal", async ({ page }) => {
    await openChallenge(page);
    await page.keyboard.type("i");
    await page.keyboard.press("Escape");
    await page.keyboard.type('ci"production');
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-strategy")).toHaveText("valid");
    await expect(page.getByTestId("result-keystrokes")).toHaveText("16");
  });

  test("unsupported keys are reported and do not change the buffer", async ({ page }) => {
    await openChallenge(page);
    await page.keyboard.press("ArrowLeft");

    await expect(page.getByText("✕ <Left> not accepted")).toBeVisible();
    await expect(page.getByTestId("buffer")).toHaveText('const mode = "development";');
    await expect(page.getByTestId("vim-mode")).toHaveText("NORMAL");
  });

  test("can retry after solving, keyboard only", async ({ page }) => {
    await openChallenge(page);
    await page.keyboard.type('ci"production');
    await page.keyboard.press("Escape");

    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("result")).toHaveCount(0);
    await expect(page.getByTestId("buffer")).toHaveText('const mode = "development";');
    await expect(page.getByRole("application", { name: "Vim practice editor" })).toBeFocused();
  });

  test("undo and redo work, and Ctrl+r redoes instead of reloading the page", async ({ page }) => {
    await openChallenge(page);
    const buffer = page.getByTestId("buffer");
    const original = 'const mode = "development";';
    const afterX = 'const mode = "devlopment";';

    await page.keyboard.press("x");
    await expect(buffer).toHaveText(afterX);

    await page.keyboard.press("u");
    await expect(buffer).toHaveText(original);

    // A reload would reset the buffer to the original and drop the redo history.
    await page.keyboard.press("Control+r");
    await expect(buffer).toHaveText(afterX);
    await expect(page.getByTestId("keystroke-count")).toHaveText("3 keys");
  });

  test("new commands work in the browser: a motion and an operator", async ({ page }) => {
    await openChallenge(page);
    const buffer = page.getByTestId("buffer");

    // 0 w moves onto `mode`; cw changes that word (not the blanks after it).
    await page.keyboard.type("0wcwname");
    await page.keyboard.press("Escape");
    await expect(buffer).toHaveText('const name = "development";');
    await expect(page.getByTestId("vim-mode")).toHaveText("NORMAL");
  });
});
