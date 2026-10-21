import type { KeyboardLayout } from "@tutor-nvim/pedagogy";
import type { KeyboardEventLike } from "./keyboard";

/**
 * Layout detection for onboarding (T-502). The learner is asked to type `"`, which sits on a
 * different physical key per layout: Shift+Quote on US ANSI, Shift+Digit2 on ES ISO. `key` says
 * what was typed and `code` says where, so together they identify the layout without asking the
 * learner to know the name of theirs. Anything else is inconclusive, never a guess.
 */
export const LAYOUT_PROBE_CHARACTER = '"';

export function detectLayout(
  event: Pick<KeyboardEventLike, "key" | "code">,
): KeyboardLayout | null {
  if (event.key !== LAYOUT_PROBE_CHARACTER) return null;
  switch (event.code) {
    case "Quote":
      return "us-ansi";
    case "Digit2":
      return "es-iso";
    default:
      return null;
  }
}

export const LAYOUT_LABELS: Readonly<Record<KeyboardLayout, string>> = {
  "us-ansi": "US ANSI",
  "es-iso": "ES ISO (Spanish)",
};
