import type { ReactNode } from "react";
import { eyebrowClass } from "../ui/styles";

export const ONBOARDING_STEPS = [
  "Welcome",
  "Keyboard",
  "Experience",
  "Check",
  "Starting point",
] as const;

interface OnboardingShellProps {
  /** Zero-based index into `ONBOARDING_STEPS`. */
  readonly step: number;
  readonly title: string;
  readonly lead?: ReactNode;
  readonly children: ReactNode;
}

function Check() {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

/** Frame of the setup flow: brand, where you are in five steps, and one idea per screen. */
export function OnboardingShell({ step, title, lead, children }: OnboardingShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-8 py-5">
        <span className="flex items-center gap-3">
          <span aria-hidden className="h-6 w-3 rounded-[2px] bg-amber" />
          <span className="text-[19px] font-bold">Tutor NeoVim</span>
        </span>
        <ol aria-label="Steps" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-3">
          {ONBOARDING_STEPS.map((name, index) => {
            const done = index < step;
            const current = index === step;
            return (
              <li
                key={name}
                {...(current ? { "aria-current": "step" as const } : {})}
                className={`flex items-center gap-2 ${
                  current ? "font-bold text-amber" : done ? "text-ink-2" : ""
                }`}
              >
                {done ? (
                  <Check />
                ) : (
                  <span
                    aria-hidden
                    className={`box-border h-2 w-2 rounded-full ${
                      current ? "bg-amber" : "border-[1.5px] border-dash"
                    }`}
                  />
                )}
                {name}
                {done ? <span className="sr-only"> (done)</span> : null}
              </li>
            );
          })}
        </ol>
        <span className="text-sm text-ink-3">
          Step {step + 1} of {ONBOARDING_STEPS.length}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col gap-8 px-8 pb-10 pt-8">
        <div className="flex max-w-[720px] flex-col gap-2.5">
          <p className={eyebrowClass}>Setup</p>
          <h1 className="text-balance text-[40px] font-bold leading-[1.15] tracking-[-0.02em]">
            {title}
          </h1>
          {lead ? <p className="text-pretty text-xl text-ink-2">{lead}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
