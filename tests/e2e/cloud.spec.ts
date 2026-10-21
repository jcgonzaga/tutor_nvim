import { expect, test, type Page } from "@playwright/test";
import { solveCurrent } from "./helpers";

/** Each test uses its own account: the API process lives for the whole run. */
const emailFor = (label: string) =>
  `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function skipOnboarding(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Skip the check/ }).click();
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

async function signIn(page: Page, email: string) {
  await page.goto("/#/account");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function expectSynced(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "synced");
}

test.describe("M6 cloud persistence", () => {
  test("progress made on one device appears on another after signing in", async ({ browser }) => {
    const email = emailFor("two-devices");

    // --- Laptop: onboard, sign in, play one exercise ---
    const laptop = await (await browser.newContext()).newPage();
    await skipOnboarding(laptop);
    await expect(laptop.getByTestId("sync-status")).toContainText("Sign in to keep your progress");
    await signIn(laptop, email);
    await expect(laptop.getByRole("heading", { name: "Today" })).toBeVisible();
    await expectSynced(laptop);

    await laptop.getByRole("button", { name: "Continue Training" }).click();
    await solveCurrent(laptop);
    await expect(laptop.getByTestId("feedback")).toBeVisible();
    await laptop.goto("/#/");
    await expectSynced(laptop);
    await laptop.goto("/#/progress");
    await expect(laptop.getByTestId("progress-attempts")).toHaveText("1");

    // --- Phone: a brand-new browser, signs in with the same account ---
    const phone = await (await browser.newContext()).newPage();
    await phone.goto("/");
    await phone.getByRole("link", { name: "I already have an account" }).click();
    await phone.getByLabel("Email").fill(email);
    await phone.getByLabel("Password").fill("correct horse battery");
    await phone.getByRole("button", { name: "Sign in" }).click();

    // No onboarding, no empty progress: the account's state arrived.
    await expect(phone.getByRole("heading", { name: "Today" })).toBeVisible();
    await expectSynced(phone);
    await phone.goto("/#/progress");
    await expect(phone.getByTestId("progress-attempts")).toHaveText("1");
    await expect(phone.getByTestId("progress-due")).toHaveText(/^\d+$/);
  });

  test("practice keeps working offline and uploads when the connection returns", async ({
    browser,
  }) => {
    const email = emailFor("offline");
    const context = await browser.newContext();
    const page = await context.newPage();
    await skipOnboarding(page);
    await signIn(page, email);
    await expectSynced(page);

    await context.setOffline(true);
    await page.getByRole("button", { name: "Continue Training" }).click();
    await solveCurrent(page);
    await expect(page.getByTestId("feedback-kind")).toBeVisible();
    // The result is on screen immediately: nothing waited for the network.

    await context.setOffline(false);
    await page.goto("/#/account");
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "synced");

    // A fresh browser with the same account sees the attempt that was made offline.
    const other = await (await browser.newContext()).newPage();
    await signIn(other, email);
    await expect(other.getByRole("heading", { name: "Today" })).toBeVisible();
    await other.goto("/#/progress");
    await expect(other.getByTestId("progress-attempts")).toHaveText("1");
  });

  test("signing out stops syncing but leaves local progress alone", async ({ page }) => {
    await skipOnboarding(page);
    await signIn(page, emailFor("signout"));
    await expectSynced(page);
    await page.goto("/#/account");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/#/");
    await expect(page.getByTestId("sync-status")).toContainText("Sign in to keep your progress");
    await expect(page.getByRole("button", { name: "Continue Training" })).toBeVisible();
  });
});
