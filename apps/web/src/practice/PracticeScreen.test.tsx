// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { contentFor } from "../exercises";
import { I18nProvider } from "../i18n/I18nProvider";
import { DEFAULT_PREFS, PREFS_KEY } from "../prefs/prefs";
import { PrefsProvider } from "../prefs/PrefsProvider";
import { memoryStorage } from "../storage/profileStore";
import { FreePractice } from "../FreePractice";

afterEach(cleanup);

const en = contentFor("en");
/** A vim exercise with hints, so the give-up control has its usual block around it. */
const exercise = en.exercises.find(
  (candidate) => candidate.kind === "vim" && candidate.hints.length > 0,
)!;

function inEnglish(node: ReactNode) {
  const storage = memoryStorage();
  storage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, language: "en" }));
  return (
    <PrefsProvider storage={storage}>
      <I18nProvider>{node}</I18nProvider>
    </PrefsProvider>
  );
}

const giveUp = () => screen.getByRole("button", { name: "I don't know this" });
const retry = () => screen.getByRole("button", { name: "Try again" });

describe("free practice: an exercise the learner cannot solve", () => {
  it("offers a way to say so, and ends the attempt as not solved", () => {
    render(inEnglish(<FreePractice slug={exercise.slug} />));
    expect(screen.queryByTestId("result")).toBeNull();

    fireEvent.click(giveUp());

    expect(screen.getByTestId("result-outcome").textContent).toBe("NOT SOLVED");
  });

  it("lets the learner redo the same exercise from scratch", () => {
    render(inEnglish(<FreePractice slug={exercise.slug} />));
    fireEvent.click(giveUp());

    fireEvent.click(retry());

    expect(screen.queryByTestId("result")).toBeNull();
    expect(screen.getByTestId("keystroke-count").textContent).toBe("0 keys");
    expect(giveUp()).toBeTruthy();
  });
});
