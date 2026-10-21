import { expect, test } from "@playwright/test";
import { onboardSkippingCheck, playWholeSession, solveCurrent, solveNextVim } from "./helpers";

const DAY_ONE = new Date("2026-10-21T09:00:00");
const DAY_THREE = new Date("2026-10-23T09:00:00");
const DAY_TEN = new Date("2026-10-30T09:00:00");

test.describe("M8 gamification and feedback", () => {
  test("a session pays XP and a combo, resets it kindly, and ends with a streak", async ({
    page,
  }) => {
    await page.clock.install({ time: DAY_ONE });
    await onboardSkippingCheck(page);
    await expect(page.getByTestId("stats-streak")).toContainText(
      "Finish a session to start a streak.",
    );
    await expect(page.getByTestId("stats-level")).toHaveText("Level 1");

    await page.getByRole("button", { name: "Continue Training" }).click();

    // First exercise: solved perfectly. 10 for solving + 5 for a perfect run, combo ×1.
    await expect(page.getByTestId("combo")).toHaveCount(0);
    await solveCurrent(page);
    await expect(page.getByTestId("reward-xp")).toHaveText("+15 XP");
    await expect(page.getByTestId("reward-combo")).toContainText("Combo ×1");
    await expect(page.getByTestId("reward-parts")).toContainText("Solved +10 · Perfect run +5");
    await page.getByRole("button", { name: "Continue" }).click();

    // The combo is in the footer of the next exercise, and grows the XP a little.
    await expect(page.getByTestId("combo")).toHaveText(/Combo ×1/);
    await solveCurrent(page);
    await expect(page.getByTestId("reward-combo")).toContainText("Combo ×2");
    // 10 + 5 perfect, plus a bonus when the exercise is a new context for the skill, with ×1.05 combo.
    await expect(page.getByTestId("reward-xp")).toHaveText(/^\+(1[5-9]|2\d) XP$/);
    await page.getByRole("button", { name: "Continue" }).click();

    // Giving up earns nothing and resets the combo as "a fresh start", not a punishment.
    let remaining = 0;
    while (!(await page.getByRole("heading", { name: "Session complete" }).isVisible())) {
      await page.getByRole("button", { name: "I don't know this" }).click();
      await expect(page.getByTestId("reward-xp")).toHaveText("+0 XP");
      await expect(page.getByTestId("reward-combo")).toContainText("a fresh start");
      await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
      remaining += 1;
      if (remaining > 20) throw new Error("session did not end");
    }

    // The summary: XP with the daily bonus, best combo, streak.
    await expect(page.getByTestId("summary-xp")).toContainText("finishing today's session");
    await expect(page.getByTestId("summary-combo")).toHaveText("×2");
    await expect(page.getByTestId("summary-streak")).toHaveText("1-day streak");
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByTestId("stats-streak")).toHaveAttribute("data-streak", "1");
    await expect(page.getByTestId("stats-streak")).toContainText("1-day streak");
    await expect(page.getByTestId("stats-xp")).toContainText(/^[1-9]\d* XP/);
  });

  test("shows the learner's run next to the master's, and replays it step by step", async ({
    page,
  }) => {
    await onboardSkippingCheck(page);
    await page.getByRole("button", { name: "Continue Training" }).click();
    const exercise = await solveNextVim(page);

    const ghost = page.getByTestId("ghost");
    await expect(ghost.getByTestId("ghost-you")).toBeVisible();
    await expect(ghost.getByTestId("ghost-master")).toBeVisible();
    const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
    await expect(ghost.getByTestId("ghost-master")).toContainText(optimal?.keys.join("") ?? "");

    await page.getByRole("button", { name: "Replay" }).click();
    const replay = page.getByTestId("replay");
    await expect(replay.getByTestId("replay-status")).toContainText("Start.");

    // Step to the end, then the replay shows the solved state the editor reached.
    const step = replay.getByRole("button", { name: "Step", exact: true });
    while (await step.isEnabled()) await step.click();
    await expect(replay.getByTestId("replay-status")).toContainText(/Step \d+ of \d+/);
    const replayed = await replay.getByTestId("buffer").innerText();
    const live = await page.getByTestId("buffer").first().innerText();
    expect(replayed).toBe(live);

    // And back to the start.
    await replay.getByRole("button", { name: "Start" }).click();
    await expect(replay.getByTestId("replay-status")).toContainText("Start.");
  });

  test("the replay can be played", async ({ page }) => {
    await onboardSkippingCheck(page);
    await page.getByRole("button", { name: "Continue Training" }).click();
    await solveNextVim(page);
    await page.getByRole("button", { name: "Replay" }).click();
    const replay = page.getByTestId("replay");
    await replay.getByRole("button", { name: "Play" }).click();
    // It advances by itself and stops on the last step, where Play is offered again.
    await expect(replay.getByTestId("replay-status")).toContainText(/Step \d+ of \d+/);
    await expect(replay.getByRole("button", { name: "Play" })).toBeVisible();
  });

  test("the replay is manual only for people who ask for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await onboardSkippingCheck(page);
    await page.getByRole("button", { name: "Continue Training" }).click();
    await solveNextVim(page);
    await page.getByRole("button", { name: "Replay" }).click();
    const replay = page.getByTestId("replay");
    await expect(replay.getByRole("button", { name: "Step", exact: true })).toBeVisible();
    await expect(replay.getByRole("button", { name: "Play" })).toHaveCount(0);
  });

  test("the streak forgives one missed day and welcomes someone back without scolding", async ({
    context,
  }) => {
    const first = await context.newPage();
    await first.clock.install({ time: DAY_ONE });
    await onboardSkippingCheck(first);
    await first.getByRole("button", { name: "Continue Training" }).click();
    await playWholeSession(first);
    await first.getByRole("button", { name: "Done" }).click();
    await expect(first.getByTestId("stats-streak")).toHaveAttribute("data-streak", "1");
    await first.close();

    // Two days later: one day was skipped, and the streak simply goes on.
    const second = await context.newPage();
    await second.clock.install({ time: DAY_THREE });
    await second.goto("/");
    await expect(second.getByTestId("stats-streak")).toHaveAttribute("data-streak", "1");
    await second.getByRole("button", { name: "Continue Training" }).click();
    await playWholeSession(second);
    await expect(second.getByTestId("summary-streak")).toHaveText("2-day streak");
    await second.getByRole("button", { name: "Done" }).click();
    await second.goto("/#/progress");
    await expect(second.getByTestId("progress-streak")).toContainText("(longest 2)");
    await second.close();

    // A week later: a new streak starts, and nothing says anything was lost.
    const third = await context.newPage();
    await third.clock.install({ time: DAY_TEN });
    await third.goto("/");
    const streak = third.getByTestId("stats-streak");
    await expect(streak).toHaveAttribute("data-streak", "0");
    await expect(streak).toContainText("Welcome back");
    await expect(streak).toContainText("longest streak was 2 days");
    expect(((await streak.textContent()) ?? "").toLowerCase()).not.toMatch(/lost|broke|fail|miss/);
  });

  test("XP is not mastery: the skill detail shows mastery with no XP anywhere in it", async ({
    page,
  }) => {
    await onboardSkippingCheck(page);
    await page.getByRole("button", { name: "Continue Training" }).click();
    await solveCurrent(page);
    await page.goto("/#/skill/vim.mode.normal");
    await expect(page.getByTestId("skill-mastery")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("XP");
  });
});
