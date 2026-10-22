import { expect, test, type Page } from "@playwright/test";

const TARGET = 'const mode = "production";';

const CANONICAL = "vim.ci-quotes.basic-001";

/** Opens an exercise and waits until the editor owns the keyboard, so no key is typed into the void. */
async function openChallenge(page: Page, slug = CANONICAL) {
  await page.goto(`/?exercise=${slug}`);
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
    await expect(page.getByTestId("result-strategy")).toHaveText("Optimal");
    await expect(page.getByTestId("result-keystrokes")).toHaveText("14");
    await expect(page.getByTestId("result-first-input")).toHaveText(/^\d+ ms$/);
    await expect(page.getByTestId("result-duration")).toHaveText(/^\d+ ms$/);
  });

  test("a successful but unplanned route is efficient, not optimal", async ({ page }) => {
    await openChallenge(page);
    await page.keyboard.type("i");
    await page.keyboard.press("Escape");
    await page.keyboard.type('ci"production');
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-strategy")).toHaveText("Efficient");
    await expect(page.getByTestId("result-keystrokes")).toHaveText("16");
  });

  test("unsupported keys are reported and do not change the buffer", async ({ page }) => {
    await openChallenge(page);
    await page.keyboard.press("ArrowLeft");

    await expect(page.getByText("<Left> not accepted")).toBeVisible();
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

test.describe("M3 exercise platform in the browser", () => {
  test("a cursor objective is solved with the same practice screen", async ({ page }) => {
    await openChallenge(page, "vim.navigation-atomic.basic-001");
    await expect(page.getByTestId("buffer")).toHaveText(/alpha beta\s*gamma delta\s*epsilon zeta/);

    await page.keyboard.type("jjlll");

    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-strategy")).toHaveText("Optimal");
    await expect(page.getByTestId("result-keystrokes")).toHaveText("5");
  });

  test("solving with repeated x succeeds but is called out as an anti-pattern", async ({
    page,
  }) => {
    await openChallenge(page, "vim.delete.word-001");
    await page.keyboard.type("xxxxx");

    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-strategy")).toHaveText("Bad habit");
    await expect(page.getByTestId("result-anti-patterns")).toContainText("Repeated x");
  });

  test("hints unlock after their delay, show one at a time, and count as used", async ({
    page,
  }) => {
    await openChallenge(page, "vim.change.word-001");
    const hint = page.getByRole("button", { name: /hint/i });

    await expect(hint).toBeDisabled();
    await expect(hint).toHaveText("Hint available soon");

    await expect(hint).toBeEnabled({ timeout: 8000 }); // first hint: 4 s after the exercise appears
    await hint.click();
    await expect(page.getByTestId("hints")).toContainText("Hint 1:");
    await expect(page.getByTestId("hints")).not.toContainText("Hint 2:");
    await expect(page.getByRole("application", { name: "Vim practice editor" })).toBeFocused();

    await page.keyboard.type("cwdone");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-hints")).toHaveText("1");
  });

  test("an exercise can start with history to undo", async ({ page }) => {
    await openChallenge(page, "vim.undo.basic-001");
    const buffer = page.getByTestId("buffer");
    await expect(buffer).toHaveText("three"); // the setup keys already deleted two words

    await page.keyboard.press("u");

    await expect(buffer).toHaveText("two three");
    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-keystrokes")).toHaveText("1");
  });

  test("the next exercise link moves on to the next one", async ({ page }) => {
    await openChallenge(page);
    await page.keyboard.type('ci"production');
    await page.keyboard.press("Escape");

    await page.getByRole("link", { name: "Next exercise" }).click();

    await expect(page).toHaveURL(/exercise=vim\.ci-quotes\.python-001/);
    await expect(
      page.getByText('Change only the text inside the quotes to "db.internal"'),
    ).toBeVisible();
    await expect(page.getByRole("application", { name: "Vim practice editor" })).toBeFocused();
  });
});
