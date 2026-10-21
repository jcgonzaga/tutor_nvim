import type { VimMode } from "@tutor-nvim/vim-engine";

/** NORMAL is amber, INSERT is blue; the word is always there too. */
export function ModePill({
  mode,
  pending = false,
}: {
  readonly mode: VimMode;
  /** An operator is waiting for its target: drawn as an outline. */
  readonly pending?: boolean;
}) {
  const label = mode.toUpperCase();
  const look =
    mode === "insert"
      ? "bg-azure text-canvas"
      : pending
        ? "border border-amber px-[9px] py-[3px] text-amber"
        : "bg-amber text-amber-ink";
  return (
    <span
      data-testid="vim-mode"
      className={`rounded-md px-2.5 py-1 font-mono text-sm font-bold tracking-[0.04em] ${look}`}
    >
      {label}
    </span>
  );
}
