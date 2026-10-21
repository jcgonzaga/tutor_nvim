import { expect, test, type Page } from "@playwright/test";
import { currentExercise, onboardUntilCalibration, solveCurrent } from "./helpers";

const DAY_ONE = new Date("2026-10-21T09:00:00");
const DAY_THREE = new Date("2026-10-23T09:00:00");

/** Plays one item of the session: solves it, or gives up on it, then moves on. Returns its eyebrow. */
async function playSessionItem(page: Page, giveUp: boolean): Promise<string> {
  const eyebrow = (await page.locator("header p").first().textContent()) ?? "";
  if (giveUp) {
    await currentExercise(page);
    await page.getByRole("button", { name: "I don't know this" }).click();
    await expect(page.getByTestId("feedback-kind")).toHaveText("Not solved");
  } else {
    await solveCurrent(page);
  }
  await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  return eyebrow;
}

/** Plays a whole session; `giveUpAt` lists item positions to fail on purpose. */
async function playSession(page: Page, giveUpAt: readonly number[] = []): Promise<string[]> {
  const eyebrows: string[] = [];
  const summary = page.getByRole("heading", { name: "Session complete" });
  for (let position = 0; position < 60; position++) {
    if (await summary.isVisible()) break;
    eyebrows.push(await playSessionItem(page, giveUpAt.includes(position)));
    await expect(summary.or(page.locator("#instruction"))).toBeVisible();
  }
  await expect(summary).toBeVisible();
  return eyebrows;
}

test.describe("M5 local product", () => {
  test("onboard, calibrate, train, close the app and come back to stored reviews", async ({
    context,
  }) => {
    // --- Day one: onboarding -------------------------------------------------------------
    const first = await context.newPage();
    await first.clock.install({ time: DAY_ONE });
    await first.goto("/");

    await expect(first.getByRole("heading", { name: "Welcome to Tutor NeoVim" })).toBeVisible();
    await first.getByRole("button", { name: "Get started" }).click();

    await first.getByTestId("layout-detect").click();
    await first.keyboard.type('"');
    await expect(first.getByTestId("layout-detected")).toHaveText("Detected: US ANSI");
    await first.getByRole("button", { name: "Continue" }).click();

    await first.getByLabel("I know the basics").check();
    await first.getByRole("button", { name: "Start the check" }).click();

    // --- Calibration: starts at the mode-switch rung; solve it, then miss word movement ----
    await expect(first.getByTestId("practice-progress")).toHaveText("Check 1");
    await solveCurrent(first);
    await expect(first.getByTestId("feedback-kind")).toHaveText(/Perfect|Completed/);
    await first.getByRole("button", { name: "Continue" }).click();

    await expect(first.getByTestId("practice-progress")).toHaveText("Check 2");
    await currentExercise(first);
    await first.getByRole("button", { name: "I don't know this yet" }).click();
    await expect(first.getByTestId("feedback-kind")).toHaveText("Not solved");
    await first.getByRole("button", { name: "Continue" }).click();

    // --- Initial estimate: a starting point, not a grade -----------------------------------
    await expect(first.getByRole("heading", { name: "Your starting point" })).toBeVisible();
    const rungs = first.getByTestId("estimate-rungs").getByRole("listitem");
    await expect(rungs).toHaveCount(4);
    await expect(rungs.nth(1)).toContainText("Solved");
    await expect(rungs.nth(2)).toContainText("Not yet");
    await first.getByRole("button", { name: "Start training" }).click();

    // --- Daily session ---------------------------------------------------------------------
    await expect(first.getByRole("heading", { name: "Today" })).toBeVisible();
    await first.getByRole("button", { name: "Continue Training" }).click();
    const eyebrows = await playSession(first, [1]);
    expect(eyebrows.length).toBeGreaterThan(3);

    await expect(first.getByTestId("summary-exercises")).toContainText("solved of");
    const trained = first.getByTestId("summary-skills").getByRole("listitem").first();
    await expect(trained).toBeVisible();
    const trainedTitle = (await trained.textContent()) ?? "";
    await expect(first.getByTestId("summary-next")).not.toBeEmpty();
    await first.getByRole("button", { name: "Done" }).click();

    await expect(first.getByTestId("home-detail")).toContainText("Today's session is done");
    await expect(first.getByRole("button", { name: "Train more" })).toBeVisible();

    // --- Skills progressed: the map and a skill's detail ------------------------------------
    await first.getByRole("link", { name: "Skill map" }).click();
    const root = first
      .getByTestId("skill-graph")
      .getByRole("link")
      .filter({ hasText: trainedTitle })
      .first();
    await expect(root).not.toHaveAttribute("data-stage", "locked");
    await expect(first.getByTestId("skill-node-vim.textobject.inner-quotes")).toHaveAttribute(
      "data-stage",
      "locked",
    );
    await root.click();
    await expect(first.getByTestId("skill-stage")).not.toHaveText(/Locked/);
    await expect(first.getByTestId("skill-attempts")).not.toHaveText("0");
    await expect(first.getByTestId("skill-next-review")).toHaveText(/^in /);

    await first.goto("/#/progress");
    await expect(first.getByTestId("progress-sessions")).toHaveText("1");

    // --- Close the app ----------------------------------------------------------------------
    await first.close();

    // --- Day three: return; the stored reviews are due --------------------------------------
    const returning = await context.newPage();
    await returning.clock.install({ time: DAY_THREE });
    await returning.goto("/");

    await expect(returning.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(returning.getByTestId("home-recommendation")).toContainText("due for review");
    await returning.getByRole("button", { name: "Continue Training" }).click();
    const later = await playSession(returning);
    expect(later.some((eyebrow) => eyebrow.startsWith("Review"))).toBe(true);
    await expect(returning.getByTestId("summary-reviews")).not.toHaveText("0");
    await returning.getByRole("button", { name: "Done" }).click();

    await returning.goto("/#/progress");
    await expect(returning.getByTestId("progress-sessions")).toHaveText("2");
  });

  test("resumes a session in progress after a reload", async ({ page }) => {
    await page.clock.install({ time: DAY_ONE });
    await page.goto("/");
    await onboardUntilCalibration(page, /never used Vim/);
    // Not solving anything is a valid answer: the check ends at the first rung.
    await page.getByRole("button", { name: "I don't know this yet" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Start training" }).click();

    await page.getByRole("button", { name: "Continue Training" }).click();
    await playSessionItem(page, false);
    await expect(page.getByTestId("practice-progress")).toHaveText(/^2 of /);

    await page.reload();
    await expect(page.getByTestId("practice-progress")).toHaveText(/^2 of /);
    await expect(page.getByTestId("storage-notice")).toHaveCount(0);
  });

  test("the first-time visitor can skip the check and start from the beginning", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Skip the check/ }).click();

    await expect(page.getByText("you start at the very beginning")).toBeVisible();
    await page.getByRole("button", { name: "Start training" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    // Onboarding is done once: a reload goes straight to today.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  test("identifies an ES ISO keyboard from the physical key that types a double quote", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();

    const probe = page.getByTestId("layout-detect");
    await probe.focus();
    await probe.dispatchEvent("keydown", { key: '"', code: "Digit2", shiftKey: true });

    await expect(page.getByTestId("layout-detected")).toHaveText("Detected: ES ISO (Spanish)");
    await expect(page.getByLabel("ES ISO (Spanish)")).toBeChecked();
  });

  test("an unreadable saved profile is kept as a backup and the learner is told", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (!window.localStorage.getItem("tutor-nvim:profile")) {
        window.localStorage.setItem("tutor-nvim:profile", "{not json");
      }
    });
    await page.goto("/");

    await expect(page.getByTestId("storage-notice")).toContainText("could not be read");
    const backup = await page.evaluate(() =>
      window.localStorage.getItem("tutor-nvim:profile:unreadable"),
    );
    expect(backup).toBe("{not json");
    await expect(page.getByRole("heading", { name: "Welcome to Tutor NeoVim" })).toBeVisible();
  });

  test("the skill map is keyboard reachable and never relies on color alone", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Skip the check/ }).click();
    await page.getByRole("button", { name: "Start training" }).click();

    await page.goto("/#/map");
    const nodes = page.getByTestId("skill-graph").getByRole("link");
    expect(await nodes.count()).toBeGreaterThan(5);
    // Every node says its state in words.
    for (const node of await nodes.all()) {
      await expect(node).toContainText(/Locked|Learning|Practicing|Fluent|Mastered/);
    }
    // Keyboard only: tab to the first node and open it.
    await page.keyboard.press("Tab");
    await expect(nodes.first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("skill-stage")).toBeVisible();
  });
});
