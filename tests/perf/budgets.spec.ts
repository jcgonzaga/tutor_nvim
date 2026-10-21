import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { editor, onboardSkippingCheck, pressTokens, solveCurrent } from "../e2e/helpers";

/**
 * The budgets AGENTS.md section 2.10 sets: keypress feedback under 50 ms, exercise transition under
 * 150 ms. They are asserted on a production build in headless Chromium, which is slower and noisier
 * than a learner's browser, so a pass here is a conservative pass; the numbers are printed so a
 * regression is visible long before it fails.
 */
const KEYPRESS_BUDGET_MS = 50;
const TRANSITION_BUDGET_MS = 150;
const LONG_TASK_BUDGET_MS = 200;
/** Gzipped JavaScript the first load downloads. The content bundle dominates; see m9 notes. */
const JS_GZIP_BUDGET_BYTES = 260 * 1024;
const CSS_GZIP_BUDGET_BYTES = 20 * 1024;
const FIRST_CONTENTFUL_PAINT_BUDGET_MS = 2000;

const percentile = (values: readonly number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};

/** Starts recording long main-thread tasks; read them back with `longTasks`. */
const watchLongTasks = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longTasks.push(entry.duration);
    }).observe({ entryTypes: ["longtask"] });
  });
const longTasks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);

test.describe("T-902 performance budgets (production build)", () => {
  test("the shipped bundle stays within its size budget", () => {
    const dist = join(process.cwd(), "apps/web/dist/assets");
    const gzipped = (extension: string) =>
      readdirSync(dist)
        .filter((file) => file.endsWith(extension) && statSync(join(dist, file)).isFile())
        .reduce((sum, file) => sum + gzipSync(readFileSync(join(dist, file))).length, 0);
    const js = gzipped(".js");
    const css = gzipped(".css");
    console.log(`bundle: js ${(js / 1024).toFixed(1)} KB gzip, css ${(css / 1024).toFixed(1)} KB`);
    expect(js).toBeLessThan(JS_GZIP_BUDGET_BYTES);
    expect(css).toBeLessThan(CSS_GZIP_BUDGET_BYTES);
  });

  test("the first screen paints quickly", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome to Tutor NeoVim" })).toBeVisible();
    const fcp = await page.evaluate(
      () =>
        performance
          .getEntriesByType("paint")
          .find((entry) => entry.name === "first-contentful-paint")?.startTime ??
        Number.POSITIVE_INFINITY,
    );
    console.log(`first contentful paint: ${fcp.toFixed(0)} ms`);
    expect(fcp).toBeLessThan(FIRST_CONTENTFUL_PAINT_BUDGET_MS);
  });

  test("a keypress is on screen in under 50 ms, with no long tasks", async ({ page }) => {
    await page.goto("/?exercise=vim.ci-quotes.shell-001");
    await expect(editor(page)).toBeFocused();
    await watchLongTasks(page);

    // The key goes in through the real handler and is measured until the next frame has been
    // produced: the work of reading it, running the engine and committing the DOM update.
    const samples = await page.evaluate(async () => {
      const target = document.querySelector<HTMLElement>('[role="application"]');
      if (!target) throw new Error("no editor");
      const count = () => document.querySelector('[data-testid="keystroke-count"]')?.textContent;
      const nextFrame = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const times: number[] = [];
      for (let i = 0; i < 120; i++) {
        const before = count();
        const key = i % 2 === 0 ? "l" : "h";
        const start = performance.now();
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key, code: key === "l" ? "KeyL" : "KeyH", bubbles: true }),
        );
        await nextFrame();
        times.push(performance.now() - start);
        if (count() === before) throw new Error("the keypress was not rendered");
      }
      return times;
    });

    // A frame is up to 16.7 ms of waiting on its own; that is part of what a learner perceives.
    const p95 = percentile(samples, 95);
    console.log(
      `keypress to next frame: median ${percentile(samples, 50).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`,
    );
    expect(p95).toBeLessThan(KEYPRESS_BUDGET_MS);
    expect(Math.max(...(await longTasks(page)), 0)).toBeLessThan(LONG_TASK_BUDGET_MS);
  });

  test("moving to the next exercise takes under 150 ms", async ({ page }) => {
    await onboardSkippingCheck(page);
    await page.getByRole("button", { name: "Continue Training" }).click();
    await watchLongTasks(page);

    const transitions: number[] = [];
    for (let step = 0; step < 3; step++) {
      await solveCurrent(page);
      // The last item leads to the summary, not to another exercise: nothing to time there.
      if (await page.getByRole("button", { name: "Finish" }).isVisible()) break;
      const ms = await page.evaluate(async () => {
        const button = Array.from(document.querySelectorAll("button")).find((b) =>
          /^(Continue|Finish)$/.test(b.textContent?.trim() ?? ""),
        );
        if (!button) throw new Error("no continue button");
        const previous = document.querySelector("#instruction")?.textContent;
        const start = performance.now();
        button.click();
        await new Promise<void>((resolve) => {
          const done = () => document.querySelector("#instruction")?.textContent !== previous;
          if (done()) return resolve();
          const observer = new MutationObserver(() => {
            if (done()) {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        });
        // Ready for typing: the next editor exists and holds focus.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        return performance.now() - start;
      });
      transitions.push(ms);
      await expect(editor(page)).toBeFocused();
    }
    expect(transitions.length).toBeGreaterThan(0);
    console.log(`exercise transition: ${transitions.map((t) => t.toFixed(0)).join(", ")} ms`);
    for (const ms of transitions) expect(ms).toBeLessThan(TRANSITION_BUDGET_MS);
    expect(Math.max(...(await longTasks(page)), 0)).toBeLessThan(LONG_TASK_BUDGET_MS);
  });

  test("typing causes no network traffic at all", async ({ page }) => {
    await page.goto("/?exercise=vim.ci-quotes.shell-001");
    await expect(editor(page)).toBeFocused();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await pressTokens(page, [..."llllhhhhjjkk", "<Esc>"]);
    expect(requests).toEqual([]);
  });
});
