import { expect, test } from "@playwright/test";
import { currentExercise, editor, onboardSkippingCheck, solveCurrent } from "./helpers";

const PWD = "/?exercise=shell.navigation.pwd-001";
const MKDIR_P = "/?exercise=shell.create.mkdir-p-001";

test.describe("M10 shell exercises in the browser", () => {
  test("a command is typed key by key, run with Enter, and its output appears in the terminal", async ({
    page,
  }) => {
    await page.goto(PWD);
    await expect(editor(page)).toBeFocused();
    await expect(page.getByTestId("shell-mode")).toHaveText("TERMINAL");

    await page.keyboard.type("pwd");
    await expect(page.getByTestId("terminal-line")).toContainText("pwd");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("terminal-output")).toHaveText("/home/user");
    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-strategy")).toHaveText("Optimal");
    await expect(page.getByTestId("keystroke-count")).toHaveText("4 keys");
  });

  test("a mistyped command is reported by the shell, counts as an error, and can be fixed", async ({
    page,
  }) => {
    await page.goto("/?exercise=shell.create.mkdir-001");
    await page.keyboard.type("mkdri backup");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("terminal-output")).toHaveText("bash: mkdri: command not found");
    await expect(page.getByTestId("result")).toHaveCount(0);

    await page.keyboard.type("mkdir backu");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("up");
    await expect(page.getByTestId("terminal-line")).toContainText("mkdir backup");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-errors")).toHaveText("1");
  });

  test("Ctrl+C abandons the line and Ctrl+U clears it, without the browser acting on them", async ({
    page,
  }) => {
    await page.goto(PWD);
    await page.keyboard.type("rm -rf");
    await page.keyboard.press("Control+u");
    await expect(page.getByTestId("terminal-line")).not.toContainText("rm");
    await page.keyboard.type("lss");
    await page.keyboard.press("Control+c");
    await expect(page.getByTestId("terminal")).toContainText("lss^C");
    await expect(page.getByTestId("terminal-line")).not.toContainText("lss");
  });

  test("the up arrow brings back the previous command", async ({ page }) => {
    await page.goto(MKDIR_P);
    await page.keyboard.type("ls");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("terminal-line")).toContainText("ls");
  });

  test("a warned-about habit is called out after the exercise is solved", async ({ page }) => {
    await page.goto("/?exercise=shell.navigation.home-001");
    for (const command of ["cd ..", "cd ..", "cd .."]) {
      await page.keyboard.type(command);
      await page.keyboard.press("Enter");
    }
    await expect(page.getByTestId("result-outcome")).toHaveText("SUCCESS");
    await expect(page.getByTestId("result-anti-patterns")).toContainText("Several cd .. in a row");
    await expect(page.getByTestId("result-strategy")).toHaveText("Bad habit");
  });

  test("hints work the same way as in the Vim editor", async ({ page }) => {
    await page.goto(PWD);
    await expect(page.getByRole("button", { name: "Show hint" })).toBeEnabled({ timeout: 6000 });
    await page.getByRole("button", { name: "Show hint" }).click();
    await expect(page.getByTestId("hints")).toContainText("print working directory");
    await expect(editor(page)).toBeFocused();
  });
});

test.describe("M10 the daily session mixes Vim and the shell from day one", () => {
  test("the first session offers both, and each is practiced with its own screen", async ({
    page,
  }) => {
    await onboardSkippingCheck(page);
    await page.getByRole("button", { name: "Continue Training" }).click();

    const kinds = new Set<string>();
    const summary = page.getByRole("heading", { name: "Session complete" });
    for (let guard = 0; guard < 12 && !(await summary.isVisible()); guard++) {
      const exercise = await currentExercise(page);
      kinds.add(exercise.kind);
      await expect(
        page.getByTestId(exercise.kind === "shell" ? "terminal" : "buffer"),
      ).toBeVisible();
      await solveCurrent(page);
      await page.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
      await expect(summary.or(page.locator("#instruction"))).toBeVisible();
    }
    expect([...kinds].sort()).toEqual(["shell", "vim"]);
    await expect(summary).toBeVisible();
  });

  test("the skill map shows the shell skills next to Vim, with the first one open", async ({
    page,
  }) => {
    await onboardSkippingCheck(page);
    await page.goto("/#/map");
    await expect(page.getByTestId("skill-node-linux.shell.navigation")).toHaveAttribute(
      "data-stage",
      "learning",
    );
    await expect(page.getByTestId("skill-node-vim.mode.normal")).toHaveAttribute(
      "data-stage",
      "learning",
    );
    await expect(page.getByTestId("skill-node-linux.shell.pipes")).toHaveAttribute(
      "data-stage",
      "locked",
    );
  });
});
