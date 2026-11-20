// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceTerminal } from "./workspaceEngine";
import { I18nProvider } from "../i18n/I18nProvider";
import { DEFAULT_PREFS, PREFS_KEY } from "../prefs/prefs";
import { PrefsProvider } from "../prefs/PrefsProvider";
import { memoryStorage } from "../storage/profileStore";
import { WorkspaceTerminalView } from "./WorkspaceTerminalView";

afterEach(cleanup);

const terminal: WorkspaceTerminal = {
  id: "term:0",
  title: "shell",
  cwd: "/project",
  entries: [
    { command: "ls", output: ["src", "package.json"] },
    { command: "npm test", output: ["ok 3 tests"] },
  ],
  pending: "npm r",
};

const renderTerminal = (state: WorkspaceTerminal) => {
  const storage = memoryStorage();
  storage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, language: "en" }));
  return render(
    <PrefsProvider storage={storage}>
      <I18nProvider>
        <WorkspaceTerminalView terminal={state} />
      </I18nProvider>
    </PrefsProvider>,
  );
};

describe("the workspace terminal view", () => {
  it("reads as a scrollback: every command with what it printed, in the order it ran", () => {
    renderTerminal(terminal);

    const log = screen.getByRole("log");
    const text = log.textContent ?? "";
    expect(text.indexOf("ls")).toBeGreaterThan(-1);
    expect(text.indexOf("src")).toBeGreaterThan(text.indexOf("ls"));
    expect(text.indexOf("npm test")).toBeGreaterThan(text.indexOf("src"));
    // One block per command that printed something, in the order they ran.
    expect(
      screen.getAllByTestId("workspace-terminal-output").map((node) => node.textContent),
    ).toEqual(["src\npackage.json", "ok 3 tests"]);
  });

  it("shows the line being typed at its prompt", () => {
    renderTerminal(terminal);

    expect(screen.getByTestId("workspace-terminal-prompt").textContent).toBe("npm r");
    // The prompt carries the directory the command would run in.
    expect(screen.getByTestId("workspace-terminal").textContent).toContain("/project");
  });

  it("shows an empty prompt at rest, instead of the last thing that was typed", () => {
    renderTerminal({ ...terminal, pending: "" });

    expect(screen.getByTestId("workspace-terminal-prompt").textContent).toBe("");
  });
});
