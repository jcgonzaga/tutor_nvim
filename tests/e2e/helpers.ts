import { expect, type Locator, type Page } from "@playwright/test";
import { loadContent, type Exercise } from "@tutor-nvim/exercise-schema";
import { readContentInput } from "../../scripts/content-fs";

const { exercises } = loadContent(readContentInput());

/** Exercises by the instruction the learner reads, so a test can solve whatever is on screen. */
const byInstruction = new Map<string, Exercise>();
for (const exercise of exercises) {
  if (byInstruction.has(exercise.instruction)) {
    throw new Error(`Two exercises share the instruction "${exercise.instruction}"`);
  }
  byInstruction.set(exercise.instruction, exercise);
}

export const editor = (page: Page): Locator =>
  page.getByRole("application", { name: "Vim practice editor" });

/** Types key tokens (`c`, `"`, `<Esc>`, `<C-r>`) into the focused editor. */
export async function pressTokens(page: Page, tokens: readonly string[]): Promise<void> {
  for (const token of tokens) {
    if (token === "<Esc>") await page.keyboard.press("Escape");
    else if (token === "<CR>") await page.keyboard.press("Enter");
    else if (token === "<Space>") await page.keyboard.press("Space");
    else if (token === "<BS>") await page.keyboard.press("Backspace");
    else if (/^<C-.>$/.test(token)) await page.keyboard.press(`Control+${token[3]}`);
    else await page.keyboard.type(token);
  }
}

/** The exercise currently on screen, found by its instruction. */
export async function currentExercise(page: Page): Promise<Exercise> {
  await expect(editor(page)).toBeFocused();
  const instruction = (await page.locator("#instruction").textContent())?.trim() ?? "";
  const exercise = byInstruction.get(instruction);
  if (!exercise) throw new Error(`No exercise has the instruction "${instruction}"`);
  return exercise;
}

/** Solves the exercise on screen with its declared optimal solution. */
export async function solveCurrent(page: Page): Promise<Exercise> {
  const exercise = await currentExercise(page);
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  if (!optimal) throw new Error(`${exercise.slug} declares no optimal solution`);
  await pressTokens(page, optimal.keys);
  await expect(page.getByTestId("feedback")).toBeVisible();
  return exercise;
}

/** Walks the onboarding up to (not including) the calibration, picking `experience`. */
export async function onboardUntilCalibration(
  page: Page,
  experience: RegExp | string,
): Promise<void> {
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(experience).check();
  await page.getByRole("button", { name: "Start the check" }).click();
}
