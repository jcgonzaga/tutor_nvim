import { expect, test, type Page } from "@playwright/test";
import { onboardSkippingCheck, solveCurrent } from "./helpers";

const COLLECT = "https://analytics.test/collect";

interface Envelope {
  installId: string;
  build?: string;
  events: { name: string; at: number; props: Record<string, unknown> }[];
}

/** Records every batch the app sends to the analytics endpoint; the endpoint itself is a stub. */
async function captureAnalytics(page: Page): Promise<Envelope[]> {
  const received: Envelope[] = [];
  await page.route(COLLECT, async (route) => {
    received.push(route.request().postDataJSON() as Envelope);
    await route.fulfill({ status: 204 });
  });
  return received;
}

/** What the page does when the tab is closed or hidden: it flushes whatever is waiting. */
const leavePage = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

async function playOneExercise(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue Training" }).click();
  await solveCurrent(page);
}

test.describe("T-903 settings and consent", () => {
  test("analytics are off by default: playing sends nothing", async ({ page }) => {
    const received = await captureAnalytics(page);
    await onboardSkippingCheck(page);
    await playOneExercise(page);
    await leavePage(page);
    await page.waitForTimeout(300);
    expect(received).toEqual([]);

    await page.goto("/#/settings");
    await expect(page.getByLabel("Share anonymous usage data")).not.toBeChecked();
    await expect(page.getByLabel("Sound")).not.toBeChecked();
  });

  test("with consent it sends named events without anything the learner typed, and stops when withdrawn", async ({
    page,
  }) => {
    const received = await captureAnalytics(page);
    await onboardSkippingCheck(page);

    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByLabel("Share anonymous usage data").check();
    await page.getByRole("link", { name: "Back to today" }).click();

    await playOneExercise(page);
    await leavePage(page);
    await expect.poll(() => received.length).toBeGreaterThan(0);

    const events = received.flatMap((envelope) => envelope.events);
    const names = events.map((event) => event.name);
    expect(names).toContain("session_started");
    expect(names).toContain("exercise_started");
    expect(names.some((name) => name === "exercise_completed" || name === "exercise_failed")).toBe(
      true,
    );

    // One random id per browser, and no field that could hold private data.
    const ids = new Set(received.map((envelope) => envelope.installId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^[\w-]{8,}$/);
    const wire = JSON.stringify(received);
    expect(wire).not.toMatch(/@/);
    for (const event of events) {
      for (const value of Object.values(event.props)) {
        expect(["number", "boolean", "string", "object"]).toContain(typeof value);
      }
    }

    // Withdrawing consent stops the flow immediately.
    await page.goto("/#/settings");
    await page.getByLabel("Share anonymous usage data").uncheck();
    const before = received.length;
    await page.goto("/");
    await playOneExercise(page);
    await leavePage(page);
    await page.waitForTimeout(300);
    expect(received.length).toBe(before);
  });
});
