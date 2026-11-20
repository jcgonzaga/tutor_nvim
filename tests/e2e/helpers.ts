import { expect, type Locator, type Page } from "@playwright/test";
import {
  loadContent,
  localizeBundle,
  validateLocale,
  type Exercise,
  type VimExercise,
} from "@tutor-nvim/exercise-schema";
import { readContentInput, readLocaleInput } from "../../scripts/content-fs";
import { planWorkspaceSolution, pressKeymapTokens } from "./workspace";

const source = loadContent(readContentInput());
const spanish = validateLocale("es", source, readLocaleInput("es")).texts;
if (!spanish) throw new Error("The Spanish translation is incomplete");

/**
 * Exercises by the instruction the learner reads, in either language, so a test can solve whatever
 * is on screen. The exercise is the same; only its text differs.
 */
const byInstruction = new Map<string, Exercise>();
for (const bundle of [source, localizeBundle(source, spanish)]) {
  const seen = new Set<string>();
  for (const exercise of bundle.exercises) {
    if (seen.has(exercise.instruction)) {
      throw new Error(`Two exercises share the instruction "${exercise.instruction}"`);
    }
    seen.add(exercise.instruction);
    byInstruction.set(exercise.instruction, exercise);
  }
}

/**
 * The practice area of whatever is on screen, in either language: `role="application"` names itself
 * after the view that owns it, and there are three views (T8).
 *
 * English: "Vim practice editor", "Shell practice terminal", "Workspace practice area".
 * Spanish: "Editor de práctica de Vim", "Terminal de práctica de shell",
 * "Zona de práctica del espacio de trabajo".
 *
 * One pattern for all three on purpose: a fourth view, or a flow that moves from a Vim exercise to a
 * workspace story, would otherwise fail with "element(s) not found" in whichever spec forgot it.
 */
const PRACTICE_AREA = /practice (editor|terminal|area)|práctica (de vim|de shell|del espacio)/i;

export const editor = (page: Page): Locator =>
  page.getByRole("application", { name: PRACTICE_AREA });

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

/** The attempt's end, whichever panel this screen shows: a session's feedback, or free practice's result. */
const expectEnded = (page: Page): Promise<void> =>
  expect(page.getByTestId("feedback").or(page.getByTestId("result"))).toBeVisible();

/**
 * The tool layers the learner has on, as the practice area reads them: the catalogs that decide
 * which keys reach a workspace action. Empty until the layer rail is used, which is the default.
 */
async function enabledLayers(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem("tutor-nvim:prefs") ?? "{}");
      const layers = (stored as { enabledLayers?: unknown }).enabledLayers;
      return Array.isArray(layers)
        ? layers.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
}

/**
 * Presses the keys of the exercise's declared optimal solution.
 *
 * A vim or shell exercise declares key tokens and they are typed as before. A workspace exercise
 * declares actions, so its keys are the ones the learner's enabled layers offer for each action
 * (T8). When a solution has no pressable form this throws before pressing anything, with the action
 * that stopped it and why: the suite never types keys for an explanation it does not have.
 */
export async function pressSolution(page: Page, exercise: Exercise): Promise<void> {
  if (exercise.kind === "workspace") {
    const plan = planWorkspaceSolution(exercise, await enabledLayers(page));
    if (plan.kind === "unpressable") {
      throw new Error(`${exercise.slug}: "${plan.action}" has no pressable key — ${plan.reason}`);
    }
    await pressKeymapTokens(page, plan.keys);
    return;
  }
  const optimal = exercise.solutions.find((solution) => solution.classification === "optimal");
  if (!optimal) throw new Error(`${exercise.slug} declares no optimal solution`);
  await pressTokens(page, optimal.keys);
}

/** Solves the exercise on screen by pressing the keys its content declares. */
export async function solveCurrent(page: Page): Promise<Exercise> {
  const exercise = await currentExercise(page);
  await pressSolution(page, exercise);
  await expectEnded(page);
  return exercise;
}

/** What one session item turned into: the exercise, and why the suite could not solve it, if not. */
export interface PlayedItem {
  readonly exercise: Exercise;
  /** The action that had no pressable key, or `null` when the item was solved for real. */
  readonly skipped: string | null;
}

/**
 * Plays the item on screen the way this suite can, and says so when it cannot.
 *
 * A workspace story whose actions the learner's layers reach is practised for real. One that cannot
 * be pressed — no layer offers the action, or it carries a path, a text, a query, a command or a tab
 * that no key can say (see `./workspace`) — is ended the way a learner who does not know it ends it:
 * `I don't know this`, which is honest about what happened, leaves the engine's state untouched, and
 * lets the session move on. The caller gets the reason instead of a quiet pass.
 */
export async function solveOrSkip(page: Page): Promise<PlayedItem> {
  const exercise = await currentExercise(page);
  if (exercise.kind === "workspace") {
    const plan = planWorkspaceSolution(exercise, await enabledLayers(page));
    if (plan.kind === "unpressable") {
      await page.getByRole("button", { name: /^I don't know this/ }).click();
      await expectEnded(page);
      return { exercise, skipped: `${plan.action}: ${plan.reason}` };
    }
  }
  await pressSolution(page, exercise);
  await expectEnded(page);
  return { exercise, skipped: null };
}

/**
 * Plays the session's items with their declared solutions until a Vim exercise is on screen, then
 * solves that one and returns it. Sessions mix shell, Vim and workspace exercises, and some checks
 * (the replay, for example) only exist for Vim; an item the suite cannot press is skipped the way
 * `solveOrSkip` skips it.
 */
export async function solveNextVim(page: Page): Promise<VimExercise> {
  for (let guard = 0; guard < 12; guard++) {
    const { exercise } = await solveOrSkip(page);
    if (exercise.kind === "vim") return exercise;
    await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
    await expect(page.locator("#instruction")).toBeVisible();
  }
  throw new Error("no Vim exercise turned up in the session");
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

/**
 * Plays every item of the daily session, solving each with its declared solution and skipping the
 * ones the catalogs cannot press (see `solveOrSkip`). A workspace story in the session is therefore
 * either practised or reported, never failed by accident.
 *
 * Returns what each item turned into, so a caller can assert on what was practised and what was not.
 */
export async function playWholeSession(page: Page): Promise<PlayedItem[]> {
  const summary = page.getByRole("heading", { name: "Session complete" });
  const played: PlayedItem[] = [];
  for (let guard = 0; guard < 60; guard++) {
    if (await summary.isVisible()) break;
    played.push(await solveOrSkip(page));
    await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
    await expect(summary.or(page.locator("#instruction"))).toBeVisible();
  }
  await expect(summary).toBeVisible();
  return played;
}

/** Onboarding without the calibration check, ending on the home screen. */
export async function onboardSkippingCheck(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Skip the check/ }).click();
  await page.getByRole("button", { name: "Start training" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}
