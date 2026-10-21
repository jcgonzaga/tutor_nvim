import { useState, type KeyboardEvent } from "react";
import { KEYBOARD_LAYOUTS, type KeyboardLayout } from "@tutor-nvim/pedagogy";
import { LAYOUT_LABELS, detectLayout } from "../input/layout";
import { primaryButton, secondaryButton } from "../ui/styles";

interface LayoutStepProps {
  readonly initial: KeyboardLayout;
  readonly onNext: (layout: KeyboardLayout) => void;
  readonly onBack: () => void;
}

/** Where the keys Vim leans on sit on each layout; the highlighted ones are the ones that move. */
const LAYOUT_HELP: Readonly<
  Record<
    KeyboardLayout,
    {
      readonly note: string;
      readonly row: readonly string[];
      readonly highlight: readonly string[];
      readonly how: readonly (readonly [key: string, text: string])[];
    }
  >
> = {
  "es-iso": {
    note: "The usual Spanish layout",
    row: ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ñ"],
    highlight: ["Ñ"],
    how: [
      ['"', "Shift + 2"],
      [";", "Shift + ,"],
      ["(", "Shift + 8"],
    ],
  },
  "us-ansi": {
    note: "The one most Vim tutorials assume",
    row: ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
    highlight: [";", "'"],
    how: [
      ['"', "Shift + ' (right of ;)"],
      [";", "One key, no Shift"],
      ["(", "Shift + 9"],
    ],
  },
};

/**
 * Layout selection (T-502). Typing `"` identifies the layout from the physical key it needs
 * (`KeyboardEvent.code`), and the radio group is the always-available alternative.
 */
export function LayoutStep({ initial, onNext, onBack }: LayoutStepProps) {
  const [layout, setLayout] = useState<KeyboardLayout>(initial);
  const [detected, setDetected] = useState<KeyboardLayout | null>(null);
  const [tried, setTried] = useState(false);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab" || event.key === "Shift") return;
    event.preventDefault();
    const found = detectLayout(event.nativeEvent);
    setTried(true);
    setDetected(found);
    if (found) setLayout(found);
  }

  return (
    <div className="flex flex-col gap-8">
      <div
        role="group"
        aria-labelledby="detect-label"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        data-testid="layout-detect"
        className="flex flex-col gap-1.5 rounded-2xl border border-dashed border-line-strong p-5"
      >
        <p id="detect-label" className="text-base">
          Click here and type a double quote:{" "}
          <kbd className="rounded-md border border-line-strong bg-raised px-2 py-0.5 font-mono">
            "
          </kbd>
        </p>
        <p role="status" data-testid="layout-detected" className="text-[15px] text-ink-2">
          {detected
            ? `Detected: ${LAYOUT_LABELS[detected]}`
            : tried
              ? "Could not tell from that key. Pick your layout below."
              : "Waiting for a key press (optional)."}
        </p>
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Keyboard layout</legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(400px,100%),1fr))] gap-5">
          {KEYBOARD_LAYOUTS.map((option) => {
            const help = LAYOUT_HELP[option];
            const on = layout === option;
            return (
              <label
                key={option}
                className={`flex cursor-pointer flex-col gap-5 rounded-2xl border-2 p-6 ${
                  on ? "border-amber bg-panel" : "border-line bg-surface"
                }`}
              >
                <span className="flex items-start gap-3.5">
                  <input
                    type="radio"
                    name="layout"
                    value={option}
                    checked={on}
                    onChange={() => setLayout(option)}
                    className="mt-1 size-[22px] flex-none accent-amber"
                  />
                  <span className="flex flex-col gap-0.5">
                    <strong className="text-[21px]">{LAYOUT_LABELS[option]}</strong>
                    <span className="text-[15px] text-ink-2">{help.note}</span>
                  </span>
                </span>
                <span aria-hidden className="flex flex-wrap gap-1">
                  {help.row.map((key) => (
                    <span
                      key={key}
                      className={`inline-flex size-8 items-center justify-center rounded-md font-mono text-sm ${
                        help.highlight.includes(key)
                          ? "bg-amber font-bold text-amber-ink"
                          : "box-border border border-line-strong bg-raised text-ink-2"
                      }`}
                    >
                      {key}
                    </span>
                  ))}
                </span>
                <span className="flex flex-col gap-2.5 border-t border-line pt-4">
                  <span className="text-sm font-bold text-ink-3">How you type</span>
                  {help.how.map(([key, text]) => (
                    <span
                      key={key}
                      className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3"
                    >
                      <code className="font-mono text-xl font-bold">{key}</code>
                      <span className="text-base text-ink-2">{text}</span>
                    </span>
                  ))}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="text-[15px] text-ink-3">
        You can change this any time. Your level is not decided here: a one-minute check measures
        it.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className={secondaryButton}>
          Back
        </button>
        <button type="button" onClick={() => onNext(layout)} className={primaryButton}>
          Continue
        </button>
      </div>
    </div>
  );
}
