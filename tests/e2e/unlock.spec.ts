import { expect, test, type Page } from "@playwright/test";
import { onboardSkippingCheck, playWholeSession } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = new Date("2026-10-21T09:00:00");

/** Skills on the map that are still locked, by the state each node says in words. */
async function lockedSkills(page: Page): Promise<string[]> {
  await page.goto("/#/map");
  const nodes = page.getByTestId("skill-graph").getByRole("link");
  await expect(nodes.first()).toBeVisible();
  const locked: string[] = [];
  for (const node of await nodes.all()) {
    if (/Locked/.test((await node.textContent()) ?? "")) {
      locked.push(((await node.getAttribute("href")) ?? "").trim());
    }
  }
  return locked;
}

test.describe("T-904 skill unlock journey", () => {
  test("practicing what a skill builds on opens the skill, and the map says so in words", async ({
    page,
  }) => {
    await page.clock.install({ time: START });
    await onboardSkippingCheck(page);
    const before = await lockedSkills(page);
    expect(before.length).toBeGreaterThan(0);

    // A few days of daily sessions: each one is a fresh session, as for a returning learner.
    let after = before;
    for (let day = 0; day < 6 && after.length >= before.length; day++) {
      await page.goto("/");
      await page
        .getByRole("button", { name: /Continue Training|Start/ })
        .first()
        .click();
      await playWholeSession(page);
      await page.clock.setFixedTime(new Date(START.getTime() + (day + 1) * DAY_MS));
      await page.reload();
      after = await lockedSkills(page);
    }

    const opened = before.filter((href) => !after.includes(href));
    expect(opened.length, "at least one skill unlocked after practice").toBeGreaterThan(0);

    // The unlocked skill is no longer described as locked, and its page says where it stands.
    await page.goto(`/${opened[0]}`);
    await expect(page.getByTestId("skill-stage")).not.toHaveText(/Locked/);
  });
});
