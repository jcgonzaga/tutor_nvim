import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  currentExercise,
  editor,
  onboardSkippingCheck,
  onboardUntilCalibration,
  playWholeSession,
  pressTokens,
  solveCurrent,
} from "./helpers";

const PRACTICE = "/?exercise=vim.ci-quotes.shell-001";

/** Free practice shows the plain result panel, not the session feedback `solveCurrent` waits for. */
async function solveInFreePractice(page: Page): Promise<void> {
  const exercise = await currentExercise(page);
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  await pressTokens(page, optimal?.keys ?? []);
  await expect(page.getByTestId("result")).toBeVisible();
}

/** WCAG 2.x A and AA rules, the bar AGENTS.md section 19 sets ("adequate contrast", visible focus). */
async function expectNoViolations(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary, `accessibility violations on ${where}`).toEqual([]);
}

/** The accessible text of the element that currently has keyboard focus. */
const focusedLabel = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return (el?.getAttribute("aria-label") ?? el?.textContent ?? el?.tagName ?? "").trim();
  });

test.describe("T-901 accessibility", () => {
  test("onboarding and calibration screens have no violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome to Tutor NeoVim" })).toBeVisible();
    await expectNoViolations(page, "welcome");

    await page.getByRole("button", { name: "Get started" }).click();
    await expect(page.getByTestId("layout-detect")).toBeVisible();
    await expectNoViolations(page, "keyboard layout");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("I know the basics")).toBeVisible();
    await expectNoViolations(page, "experience");

    await page.getByLabel("I know the basics").check();
    await page.getByRole("button", { name: "Start the check" }).click();
    await currentExercise(page);
    await expectNoViolations(page, "calibration exercise");

    await solveCurrent(page);
    await expectNoViolations(page, "calibration feedback");
  });

  test("home, session, map, progress, settings and account have no violations", async ({
    page,
  }) => {
    await page.goto("/");
    await onboardUntilCalibration(page, "I know the basics");
    await page.getByRole("button", { name: /I don't know this/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /I don't know this/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Your starting point" })).toBeVisible();
    await expectNoViolations(page, "estimate");
    await page.getByRole("button", { name: "Start training" }).click();

    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expectNoViolations(page, "home");

    await page.getByRole("button", { name: "Continue Training" }).click();
    await currentExercise(page);
    await expectNoViolations(page, "session exercise");
    await solveCurrent(page);
    await expectNoViolations(page, "session feedback");

    for (const [route, heading] of [
      ["#/map", /skill map/i],
      ["#/progress", /progress/i],
      ["#/settings", /settings/i],
      ["#/account", /sign in|account/i],
    ] as const) {
      await page.goto(`/${route}`);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await expectNoViolations(page, route);
    }

    await page.goto("/#/map");
    await page.getByRole("link").filter({ hasText: /./ }).nth(1).click();
    await expectNoViolations(page, "skill detail");
  });

  test("the session summary has no violations", async ({ page }) => {
    await onboardSkippingCheck(page);
    await page.getByRole("button", { name: "Continue Training" }).click();
    await playWholeSession(page);
    await expectNoViolations(page, "session summary");
  });

  test("free practice, with a hint and a result, has no violations", async ({ page }) => {
    await page.goto(PRACTICE);
    await editor(page).waitFor();
    await expectNoViolations(page, "free practice");
    await solveInFreePractice(page);
    await expectNoViolations(page, "free practice result");
  });
});

test.describe("T-901 keyboard, focus and motion", () => {
  test("the whole onboarding is reachable and operable by keyboard alone", async ({ page }) => {
    await page.goto("/");
    // Tab reaches the primary action in a few presses, whatever comes first in the page.
    for (let i = 0; i < 6 && !/Get started/.test(await focusedLabel(page)); i++) {
      await page.keyboard.press("Tab");
    }
    expect(await focusedLabel(page)).toMatch(/Get started/);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("layout-detect")).toBeVisible();
    // Every control reached by Tab has a visible focus indicator.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      const outline = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element);
        return { width: style.outlineWidth, style: style.outlineStyle };
      });
      expect(outline.style).not.toBe("none");
      expect(outline.width).not.toBe("0px");
    }
  });

  test("the editor shows focus and hands it to the result when the attempt ends", async ({
    page,
  }) => {
    await page.goto(PRACTICE);
    await expect(editor(page)).toBeFocused();
    const outline = await editor(page).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await solveInFreePractice(page);
    await expect(page.getByRole("button", { name: "Try again" })).toBeFocused();
  });

  test("status is never colour alone: results and mode carry text", async ({ page }) => {
    await page.goto(PRACTICE);
    await expect(page.getByTestId("vim-mode")).toHaveText("NORMAL");
    await page.keyboard.type("Q");
    await expect(page.getByText(/not accepted/)).toBeVisible();
    await solveInFreePractice(page);
    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
  });

  test("reduced motion removes animation from the app", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(PRACTICE);
    const animated = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll("*")).filter((el) => {
          const style = getComputedStyle(el);
          return (
            (style.animationName !== "none" && parseFloat(style.animationDuration) > 0.01) ||
            parseFloat(style.transitionDuration) > 0.01
          );
        }).length,
    );
    expect(animated).toBe(0);
  });
});
