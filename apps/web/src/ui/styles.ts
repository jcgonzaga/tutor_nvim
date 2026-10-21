/** Shared class names, so every screen has the same button, card and link look (focus: see index.css). */
const button =
  "inline-flex items-center justify-center gap-3.5 rounded-xl font-bold no-underline disabled:cursor-not-allowed disabled:opacity-50";

/** The one main action of a screen. */
export const primaryButton = `${button} min-h-14 bg-amber px-6 text-lg text-amber-ink hover:bg-amber-hi`;
/** A second action next to the primary one. */
export const secondaryButton = `${button} min-h-14 border border-line-strong px-5 text-[17px] text-ink hover:bg-raised`;
/** Small, quiet actions (hints, replay, dismiss). */
export const quietButton = `${button} min-h-11 rounded-lg border border-line-strong px-3.5 text-[15px] font-semibold text-ink-2 hover:bg-raised hover:text-ink disabled:text-ink-3 disabled:hover:bg-transparent`;
export const linkClass = "font-semibold text-ink-2 underline underline-offset-4 hover:text-amber";
export const cardClass = "rounded-2xl border border-line bg-surface p-6";
export const eyebrowClass = "text-[15px] font-bold tracking-[0.04em] text-amber";
export const sectionLabelClass = "text-[15px] font-bold text-ink-2";
export const inputClass =
  "min-h-12 w-full rounded-lg border border-line-strong bg-raised px-3.5 text-ink placeholder:text-ink-3";
