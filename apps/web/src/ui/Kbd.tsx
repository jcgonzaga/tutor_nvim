import type { ReactNode } from "react";

export type KbdState =
  /** Resting key. */
  | "rest"
  /** The key to press next. */
  | "next"
  /** Pressed and right. */
  | "correct"
  /** Pressed and wrong. */
  | "error"
  /** A key from the learner's own run. */
  | "plain";

export type KbdSize = "xs" | "sm" | "md" | "lg";

const SIZES: Readonly<Record<KbdSize, string>> = {
  xs: "min-w-[26px] h-[26px] px-1.5 rounded-[5px] border-b-2 text-[13px]",
  sm: "min-w-9 h-9 px-2 rounded-[7px] border-b-[3px] text-[17px]",
  md: "min-w-12 h-12 px-3 rounded-[9px] border-b-4 text-[22px]",
  lg: "min-w-16 h-16 px-4 rounded-xl border-b-[5px] text-[28px]",
};

/** Each state differs in lightness and border as well as hue; the symbols are the caller's words. */
const STATES: Readonly<Record<KbdState, string>> = {
  rest: "bg-raised border border-line-strong text-ink font-medium",
  plain: "bg-raised border border-line-strong text-ink font-medium",
  next: "bg-raised border-2 border-amber text-amber font-medium",
  correct: "bg-azure border border-azure border-b-azure-deep text-canvas font-bold",
  error: "bg-ember-bg border-2 border-ember text-ember-ink font-medium",
};

interface KbdProps {
  readonly children: ReactNode;
  readonly state?: KbdState;
  readonly size?: KbdSize;
  readonly className?: string;
}

/** A keycap. Used for sequences, shortcuts and the keys a skill is about. */
export function Kbd({ children, state = "rest", size = "sm", className = "" }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center font-mono box-border ${SIZES[size]} ${STATES[state]} ${className}`}
    >
      {children}
    </kbd>
  );
}

/** The keyboard hint inside a primary button ("Enter"). Decorative: the button has its own name. */
export function KeyHint({
  children,
  onAccent = true,
}: {
  children: ReactNode;
  onAccent?: boolean;
}) {
  return (
    <kbd
      aria-hidden
      className={`inline-flex h-8 items-center rounded-md px-2.5 font-mono text-sm font-medium ${
        onAccent
          ? "bg-amber-ink/15 text-amber-ink"
          : "border border-line-strong bg-raised text-ink-2"
      }`}
    >
      {children}
    </kbd>
  );
}
