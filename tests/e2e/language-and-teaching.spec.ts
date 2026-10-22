import { expect, test, type Page } from "@playwright/test";
import { currentExercise, editor, solveCurrent } from "./helpers";

/**
 * ADR-0005. These journeys start from a clean browser, so they see what a new learner sees:
 * Spanish, and the theory of every skill still to be read. (The other suites seed English and
 * already-seen theory; see seed.ts.)
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function onboardInSpanish(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Te damos la bienvenida a Tutor NeoVim" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Empezar/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Saltar la prueba/ }).click();
  await page.getByRole("button", { name: "Empezar a entrenar" }).click();
  await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
}

/** Reads every theory card in front of the exercise (a first exercise can teach two skills). */
async function readTheory(page: Page): Promise<number> {
  let screens = 0;
  while (await page.getByTestId("lesson").isVisible()) {
    await expect(page.getByTestId("lesson-progress")).toContainText("Tarjeta 1 de");
    while (!(await page.getByRole("button", { name: "Entendido, a practicar" }).isVisible())) {
      await page.getByRole("button", { name: /^Siguiente/ }).click();
    }
    await page.getByRole("button", { name: "Entendido, a practicar" }).click();
    screens += 1;
  }
  return screens;
}

test.describe("language", () => {
  test("a new learner gets Spanish, and can switch to English at any time", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("button", { name: /^Empezar/ })).toBeVisible();

    // The selector is on the very first screen and applies immediately.
    await page.getByLabel("Idioma").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Welcome to Tutor NeoVim" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Get started/ })).toBeVisible();

    // It is remembered on this device.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Welcome to Tutor NeoVim" })).toBeVisible();
  });

  test("settings change the language of the app and of the exercise text", async ({ page }) => {
    await onboardInSpanish(page);
    await page.goto("/#/settings");
    await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
    await page.getByLabel("Idioma").selectOption("en");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await page.goto("/#/skill/vim.operator.change");
    await expect(page.getByRole("heading", { name: "Change" })).toBeVisible();
    await page.goto("/#/settings");
    await page.getByLabel("Language").selectOption("es");
    await page.goto("/#/skill/vim.operator.change");
    await expect(page.getByRole("heading", { name: "Cambiar" })).toBeVisible();
  });
});

test.describe("theory before practice", () => {
  test("a new skill is taught once, can be skipped, and does not come back", async ({ page }) => {
    await onboardInSpanish(page);
    await page.goto("/#/session");

    // Theory comes first, one idea per screen; skipping it also counts as seen.
    await expect(page.getByTestId("lesson")).toBeVisible();
    await expect(page.locator("#instruction")).toHaveCount(0);
    await page.getByRole("button", { name: "Saltar teoría" }).click();

    // Either the next skill's theory (skipped the same way) or the exercise itself.
    while (await page.getByTestId("lesson").isVisible()) {
      await page.getByRole("button", { name: "Saltar teoría" }).click();
    }
    await expect(page.locator("#instruction")).toBeVisible();
    await expect(editor(page)).toBeFocused();

    await page.reload();
    await expect(page.locator("#instruction")).toBeVisible();
    await expect(page.getByTestId("lesson")).toHaveCount(0);
  });

  test("the theory can be read card by card and reopened from the skill's page", async ({
    page,
  }) => {
    await onboardInSpanish(page);
    await page.goto("/#/session");
    const screens = await readTheory(page);
    expect(screens).toBeGreaterThan(0);
    await expect(page.locator("#instruction")).toBeVisible();

    await page.goto("/#/skill/vim.operator.change");
    const theory = page.getByTestId("skill-theory");
    await expect(theory).toBeVisible();
    await theory.getByText("Repasar la teoría").click();
    await expect(theory.getByRole("heading", { level: 4 }).first()).toBeVisible();
  });
});

test.describe("explanations after the attempt", () => {
  test("giving up explains why, in Spanish, with the theory one click away", async ({ page }) => {
    await onboardInSpanish(page);
    await page.goto("/#/session");
    await readTheory(page);
    await expect(page.locator("#instruction")).toBeVisible();

    await page.getByRole("button", { name: "No lo sé" }).click();
    await expect(page.getByTestId("feedback")).toBeVisible();
    await expect(page.getByTestId("feedback-kind")).toHaveText("No resuelto");

    const explanation = page.getByTestId("explanation");
    await expect(explanation).toBeVisible();
    await expect(explanation.getByRole("heading", { name: "¿Por qué?" })).toBeVisible();
    await expect(explanation).toContainText("Este no se resolvió");
    await expect(page.getByTestId("explanation-text")).not.toBeEmpty();
    // Never an English sentence inside the Spanish explanation.
    await expect(page.getByTestId("explanation-text")).not.toContainText(/\b(the|which|because)\b/);
  });

  test("a clean optimal solution gets no explanation", async ({ page }) => {
    await onboardInSpanish(page);
    await page.goto("/#/session");
    await readTheory(page);
    await expect(page.locator("#instruction")).toBeVisible();
    const exercise = await currentExercise(page);
    await solveCurrent(page);
    await expect(page.getByTestId("feedback-kind")).toHaveText("Perfecto");
    await expect(page.getByTestId("explanation")).toHaveCount(0);
    expect(exercise.explanation).toBeTruthy();
  });
});
