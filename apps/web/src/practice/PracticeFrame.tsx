import type { ReactNode } from "react";
import { useT } from "../i18n/I18nProvider";

interface PracticeFrameProps {
  /** Small label above the instruction. */
  readonly eyebrow?: string | undefined;
  /** Minimal progress for sessions and calibration, e.g. "3 of 12". */
  readonly progress?: string | undefined;
  readonly instruction: string;
  /** The practice area: the editor, its footer and the hints. */
  readonly children: ReactNode;
  /** The layer rail, beside the practice area on a wide screen (keymap-layers.md T6). */
  readonly rail: ReactNode;
}

/**
 * The frame every practice screen shares: the way out, the progress, the instruction and the rail.
 *
 * Extracted when the workspace view joined the screen (T8), so the three views differ in what they
 * draw and never in the way they leave, count or label an exercise. `id="instruction"` is the anchor
 * an editor points its `aria-describedby` at.
 */
export function PracticeFrame({
  eyebrow,
  progress,
  instruction,
  children,
  rail,
}: PracticeFrameProps) {
  const t = useT();
  // "3 of 12" (in any language) draws a thin bar next to the text; any other wording is shown as it is.
  const counted = progress ? /^(\d+)\D+(\d+)$/.exec(progress) : null;
  const fraction = counted
    ? Math.min(1, Number(counted[1]) / Math.max(1, Number(counted[2])))
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-8 py-4">
        <a
          href="#/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-[15px] font-semibold text-ink-2 no-underline hover:text-ink"
        >
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
          {t.practice.exit}
        </a>
        {progress ? (
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <span data-testid="practice-progress">{progress}</span>
            {fraction !== null ? (
              <span aria-hidden className="h-1 w-[120px] overflow-hidden rounded-sm bg-line">
                <span className="block h-full bg-amber" style={{ width: `${fraction * 100}%` }} />
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-6 px-8 pb-12 pt-8 lg:flex-row lg:items-start">
        <main className="flex min-w-0 flex-1 flex-col gap-7">
          <header className="flex flex-col gap-3.5">
            <p className="text-[15px] font-bold tracking-[0.04em] text-amber">
              {eyebrow ?? t.practice.defaultEyebrow}
            </p>
            <h1 id="instruction" className="text-balance text-[32px] font-bold leading-tight">
              {instruction}
            </h1>
          </header>
          {children}
        </main>
        {rail}
      </div>
    </div>
  );
}
