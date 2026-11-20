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
/**
 * Gzipped JavaScript the first load downloads: the entry module and everything `index.html`
 * preloads with it. The content bundle dominates; see m9 notes. Raised from 260 KB to 300 KB for
 * ADR-0005. Both language packs used to ship in that one chunk even though a learner reads one
 * language; the Spanish interface catalog and the Spanish content overlay are now assets of their
 * own, fetched by a learner who reads Spanish (T-902), so neither is part of this number.
 */
const JS_GZIP_BUDGET_BYTES = 300 * 1024;
const CSS_GZIP_BUDGET_BYTES = 20 * 1024;
const FIRST_CONTENTFUL_PAINT_BUDGET_MS = 2000;

/** The production build written by `pnpm --filter @tutor-nvim/web build`. */
const DIST = join(process.cwd(), "apps/web/dist");
const ASSETS = join(DIST, "assets");

/** The scripts `index.html` asks for: the entry module and whatever it preloads with it. */
const firstLoadScripts = (): string[] =>
  [
    ...readFileSync(join(DIST, "index.html"), "utf8").matchAll(
      /(?:src|href)="\.?\/assets\/([^"]+\.js)"/g,
    ),
  ].map((match) => match[1]!);

/**
 * The Spanish language packs, as the build names them: the interface catalog is a named chunk
 * (`apps/web/vite.config.ts`) and the content overlay is the chunk of `src/i18n/esContent.ts`.
 * Matched against asset file names and against request URLs.
 */
const CATALOG_CHUNK = /catalog-es-[^/]+\.js/;
const CONTENT_CHUNK = /esContent-[^/]+\.js/;
const LANGUAGE_CHUNKS = [CATALOG_CHUNK, CONTENT_CHUNK] as const;
const isLanguageChunk = (value: string): boolean =>
  LANGUAGE_CHUNKS.some((chunk) => chunk.test(value));

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

/** Switches the seeded device preferences to Spanish before the app boots (ADR-0005). */
const asSpanishLearner = (page: Page) =>
  page.addInitScript(() => {
    const key = "tutor-nvim:prefs";
    const stored: Record<string, unknown> = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...stored, language: "es" }));
  });

const watchLanguagePack = (page: Page): string[] => {
  const fetched: string[] = [];
  page.on("request", (request) => {
    if (isLanguageChunk(request.url())) fetched.push(request.url());
  });
  return fetched;
};

/** Walks the first-run steps of a Spanish learner: the buttons read Spanish (ADR-0005). */
const onboardInSpanish = async (page: Page): Promise<void> => {
  await page.goto("/");
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Saltar la prueba/ }).click();
  await page.getByRole("button", { name: "Empezar a entrenar" }).click();
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
};

test.describe("T-902 performance budgets (production build)", () => {
  test("the shipped bundle stays within its size budget", () => {
    const gzipped = (files: readonly string[]) =>
      files.reduce((sum, file) => sum + gzipSync(readFileSync(join(ASSETS, file))).length, 0);
    const inAssets = (extension: string) =>
      readdirSync(ASSETS).filter(
        (file) => file.endsWith(extension) && statSync(join(ASSETS, file)).isFile(),
      );
    const firstLoad = firstLoadScripts();
    // Chunks reached only through a dynamic import: a learner on the practice screen never asks for
    // a language they do not read, so those bytes are not part of the first load.
    const later = inAssets(".js").filter((file) => !firstLoad.includes(file));

    const js = gzipped(firstLoad);
    const css = gzipped(inAssets(".css"));
    console.log(
      `bundle: js ${(js / 1024).toFixed(1)} KB gzip on first load, css ${(css / 1024).toFixed(1)} KB`,
    );
    console.log(
      `bundle: fetched later: ${(gzipped(later) / 1024).toFixed(1)} KB gzip (${later.join(", ")})`,
    );

    // Neither language pack is in the entry chunk: one asset each, not preloaded.
    for (const chunk of LANGUAGE_CHUNKS) {
      expect(later.filter((file) => chunk.test(file)), String(chunk)).toHaveLength(1);
    }
    expect(firstLoad.some((file) => isLanguageChunk(file))).toBe(false);

    // The Spanish overlay really is inside its chunk, recognised by its own text, and the entry
    // carries only the source content every learner needs as the base.
    const sourceAndEntry = firstLoad
      .map((file) => readFileSync(join(ASSETS, file), "utf8"))
      .join("\n");
    expect(sourceAndEntry).not.toContain('title: "Cambiar"');
    const spanishContent = later.filter((file) =>
      readFileSync(join(ASSETS, file), "utf8").includes('title: "Cambiar"'),
    );
    expect(spanishContent, "the Spanish content overlay is a chunk of its own").toHaveLength(1);
    expect(CONTENT_CHUNK.test(spanishContent[0]!)).toBe(true);

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

  test("a key typed in the terminal is on screen in under 50 ms, even after a long transcript", async ({
    page,
  }) => {
    await page.goto("/?exercise=shell.create.mkdir-001");
    await expect(editor(page)).toBeFocused();
    // Fill the transcript first: rendering must not slow down as the terminal fills up.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.type("ls");
      await page.keyboard.press("Enter");
    }
    await expect(page.getByTestId("terminal-output")).toHaveCount(40);

    const samples = await page.evaluate(async () => {
      const target = document.querySelector<HTMLElement>('[role="application"]');
      if (!target) throw new Error("no terminal");
      const line = () => document.querySelector('[data-testid="terminal-line"]')?.textContent;
      const nextFrame = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const times: number[] = [];
      for (let i = 0; i < 120; i++) {
        const before = line();
        const key = i % 2 === 0 ? "a" : "Backspace";
        const start = performance.now();
        target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        await nextFrame();
        times.push(performance.now() - start);
        if (line() === before) throw new Error("the key was not rendered");
      }
      return times;
    });
    const p95 = percentile(samples, 95);
    console.log(
      `terminal key to next frame: median ${percentile(samples, 50).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`,
    );
    expect(p95).toBeLessThan(KEYPRESS_BUDGET_MS);
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
          /^(Continue|Finish)/.test(b.textContent?.trim() ?? ""),
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

  test("a learner who reads English never downloads the Spanish packs", async ({ page }) => {
    const fetched = watchLanguagePack(page);
    await page.goto("/?exercise=vim.ci-quotes.shell-001");
    await expect(editor(page)).toBeFocused();
    await pressTokens(page, [..."llllhhhh"]);
    expect(fetched).toEqual([]);
  });

  test("a learner who reads Spanish gets Spanish, interface and exercise text", async ({
    page,
  }) => {
    await asSpanishLearner(page);
    const fetched = watchLanguagePack(page);
    // The interface comes from the catalog pack.
    await onboardInSpanish(page);

    // The skill title comes from the content overlay, not from the interface catalog: it only reads
    // "Cambiar" once the content pack has arrived.
    await page.goto("/#/skill/vim.operator.change");
    await expect(page.getByRole("heading", { name: "Cambiar" })).toBeVisible();

    expect(fetched.some((url) => CATALOG_CHUNK.test(url))).toBe(true);
    expect(fetched.some((url) => CONTENT_CHUNK.test(url))).toBe(true);
  });

  test("without its packs the screen reads in English, never a raw key", async ({ page }) => {
    await asSpanishLearner(page);
    // Packs that cannot be fetched must not take the screen down with them.
    await page.route(CATALOG_CHUNK, (route) => route.abort());
    await page.route(CONTENT_CHUNK, (route) => route.abort());
    // English interface text: this learner's packs are unreachable, the source language is not.
    await onboardSkippingCheck(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    // English exercise text too, never a key and never a crash screen.
    await page.goto("/#/skill/vim.operator.change");
    await expect(page.getByRole("heading", { name: "Change" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
