import { useState, type KeyboardEvent } from "react";
import { KEYBOARD_LAYOUTS, type KeyboardLayout } from "@tutor-nvim/pedagogy";
import { LAYOUT_LABELS, detectLayout } from "../input/layout";
import { primaryButton, secondaryButton } from "../ui/styles";

interface LayoutStepProps {
  readonly initial: KeyboardLayout;
  readonly onNext: (layout: KeyboardLayout) => void;
  readonly onBack: () => void;
}

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
    <div className="space-y-5">
      <p className="text-zinc-300">Which keyboard are you using?</p>

      <div
        role="group"
        aria-labelledby="detect-label"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        data-testid="layout-detect"
        className="rounded border border-dashed border-zinc-600 p-4 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400"
      >
        <p id="detect-label" className="text-sm">
          Click here and type a double quote: <kbd className="font-mono">"</kbd>
        </p>
        <p role="status" data-testid="layout-detected" className="mt-2 text-sm text-zinc-300">
          {detected
            ? `Detected: ${LAYOUT_LABELS[detected]}`
            : tried
              ? "Could not tell from that key. Pick your layout below."
              : "Waiting for a key press (optional)."}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm text-zinc-400">Layout</legend>
        {KEYBOARD_LAYOUTS.map((option) => (
          <label key={option} className="flex items-center gap-2">
            <input
              type="radio"
              name="layout"
              value={option}
              checked={layout === option}
              onChange={() => setLayout(option)}
              className="size-4 accent-sky-400"
            />
            {LAYOUT_LABELS[option]}
          </label>
        ))}
      </fieldset>

      <div className="flex gap-3">
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
