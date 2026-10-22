// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExplanationPlan } from "@tutor-nvim/evaluation";
import { contentFor } from "../exercises";
import { I18nProvider } from "../i18n/I18nProvider";
import { PrefsProvider } from "../prefs/PrefsProvider";
import { PREFS_KEY, DEFAULT_PREFS } from "../prefs/prefs";
import { memoryStorage } from "../storage/profileStore";
import { ExplanationPanel } from "./ExplanationPanel";
import { LessonView } from "./LessonView";

afterEach(cleanup);

const en = contentFor("en");
const es = contentFor("es");
const change = en.findSkill("vim.operator.change")!;

function inSpanish(node: React.ReactNode) {
  const storage = memoryStorage();
  storage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, language: "es" }));
  return (
    <PrefsProvider storage={storage}>
      <I18nProvider>{node}</I18nProvider>
    </PrefsProvider>
  );
}

describe("LessonView (Discover stage)", () => {
  it("shows one card at a time and walks through them", () => {
    const onDone = vi.fn();
    render(<LessonView skill={change} onDone={onDone} />);
    expect(screen.getByTestId("lesson-progress").textContent).toBe(
      `Card 1 of ${change.lesson.length}`,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(change.lesson[0]!.title);
    expect(screen.queryByRole("button", { name: /^Back/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(change.lesson[1]!.title);
    fireEvent.click(screen.getByRole("button", { name: /^Back/ }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(change.lesson[0]!.title);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("finishes on the last card, and can be skipped at any time", () => {
    const onDone = vi.fn();
    const { unmount } = render(<LessonView skill={change} onDone={onDone} />);
    for (let i = 1; i < change.lesson.length; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    }
    fireEvent.click(screen.getByRole("button", { name: /^Got it/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
    unmount();

    const skipped = vi.fn();
    render(<LessonView skill={change} onDone={skipped} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip theory" }));
    expect(skipped).toHaveBeenCalledTimes(1);
  });

  it("moves with the arrow keys and skips with Esc, only while focus is inside", () => {
    const onDone = vi.fn();
    render(<LessonView skill={change} onDone={onDone} />);
    const region = screen.getByTestId("lesson");
    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(screen.getByTestId("lesson-progress").textContent).toContain("Card 2");
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(screen.getByTestId("lesson-progress").textContent).toContain("Card 1");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.keyDown(region, { key: "Escape" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows a skill's keys as keycaps for Vim and as a command for the shell", () => {
    const { container, unmount } = render(<LessonView skill={change} onDone={() => undefined} />);
    expect(change.lesson[0]!.keys).toBeTruthy();
    expect(container.querySelectorAll("kbd").length).toBeGreaterThan(1);
    unmount();

    const copy = en.findSkill("linux.shell.copy-move")!;
    const shell = render(<LessonView skill={copy} onDone={() => undefined} />);
    expect(shell.container.querySelector("code")?.textContent).toBe(copy.lesson[0]!.keys);
  });

  it("speaks Spanish when the language is Spanish", () => {
    render(inSpanish(<LessonView skill={es.findSkill("vim.operator.change")!} onDone={vi.fn()} />));
    expect(screen.getByRole("button", { name: /^Siguiente/ })).toBeTruthy();
    expect(screen.getByText("Saltar teoría")).toBeTruthy();
    expect(screen.getByTestId("lesson-progress").textContent).toMatch(/^Tarjeta 1 de /);
  });
});

describe("ExplanationPanel (after a poor attempt)", () => {
  const plan = (overrides: Partial<ExplanationPlan>): ExplanationPlan => ({
    reason: "low-score",
    antiPatterns: [],
    ...overrides,
  });

  it("shows nothing when the attempt needed no explanation", () => {
    const { container } = render(
      <ExplanationPanel plan={plan({ reason: null })} explanation="because" skills={[change]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("explains why, says whether it was unsolved or just slow, and names the habits", () => {
    const { rerender } = render(
      <ExplanationPanel
        plan={plan({ reason: "unsolved", antiPatterns: ["repeated_x", "arrow_keys"] })}
        explanation="ciw swaps the word under the cursor."
        skills={[]}
      />,
    );
    expect(screen.getByTestId("explanation-text").textContent).toBe(
      "ciw swaps the word under the cursor.",
    );
    expect(screen.getByText("This one was not solved. Here is how it works:")).toBeTruthy();
    expect(screen.getByText(/Repeated x\./)).toBeTruthy();
    expect(screen.getByText(/Arrow keys\./)).toBeTruthy();

    rerender(<ExplanationPanel plan={plan({})} explanation="x" skills={[]} />);
    expect(screen.getByText("You solved it, but there was a much easier way:")).toBeTruthy();
    expect(screen.queryByText("Habits to fix")).toBeNull();
  });

  it("offers the theory of each skill without leaving the screen", () => {
    render(<ExplanationPanel plan={plan({})} explanation="x" skills={[change]} />);
    const summary = screen.getByText(`Review the theory: ${change.title}`);
    expect(summary.closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getAllByRole("heading", { level: 4 }).length).toBe(change.lesson.length);
  });

  it("speaks Spanish when the language is Spanish", () => {
    render(
      inSpanish(
        <ExplanationPanel
          plan={plan({ reason: "unsolved", antiPatterns: ["repeated_x"] })}
          explanation="porque sí"
          skills={[]}
        />,
      ),
    );
    expect(screen.getByRole("heading", { name: "¿Por qué?" })).toBeTruthy();
    expect(screen.getByText("Este no se resolvió. Así funciona:")).toBeTruthy();
    expect(screen.getByText(/x repetida\./)).toBeTruthy();
  });
});
