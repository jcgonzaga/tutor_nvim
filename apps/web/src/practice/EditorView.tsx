import type { Position, VimMode } from "@tutor-nvim/vim-engine";

interface EditorViewProps {
  readonly lines: readonly string[];
  readonly cursor: Position;
  readonly mode: VimMode;
  /** An operator is waiting for its target: the cursor is underlined instead of a block. */
  readonly pending?: boolean;
  /** Fewer filler rows for small previews such as the replay. */
  readonly minRows?: number;
}

const ROW = 42;
const PAD = 24;

/**
 * Renders the buffer with a line-number gutter. The cursor never relies on colour alone: NORMAL
 * draws a block over the character, INSERT a bar between characters, and a waiting operator an
 * underline. The element marked `buffer` holds exactly the buffer text; the gutter sits beside it.
 */
export function EditorView({ lines, cursor, mode, pending = false, minRows = 4 }: EditorViewProps) {
  const rows = Math.max(lines.length, minRows);
  return (
    <div
      className="relative flex font-mono text-[24px] leading-[42px]"
      style={{ paddingTop: PAD, paddingBottom: PAD }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 bg-raised"
        style={{ top: PAD + cursor.line * ROW, height: ROW }}
      />
      <div aria-hidden className="relative w-[72px] shrink-0 pr-6 text-right text-ink-3">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className={
              index === cursor.line ? "text-ink" : index >= lines.length ? "text-dash" : ""
            }
          >
            {index < lines.length ? index + 1 : "~"}
          </div>
        ))}
      </div>
      <div data-testid="buffer" className="relative min-w-0 flex-1 overflow-x-auto pr-6">
        {lines.map((line, index) => (
          <div key={index} className="whitespace-pre" style={{ minHeight: ROW }}>
            {index === cursor.line ? (
              <CursorLine line={line} column={cursor.column} mode={mode} pending={pending} />
            ) : (
              line
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CursorLine({
  line,
  column,
  mode,
  pending,
}: {
  line: string;
  column: number;
  mode: VimMode;
  pending: boolean;
}) {
  const before = line.slice(0, column);

  if (mode === "insert") {
    return (
      <>
        {before}
        <span
          aria-hidden
          className="-mx-px inline-block h-[30px] translate-y-1.5 border-l-2 border-azure"
        />
        {line.slice(column)}
      </>
    );
  }

  const char = line.charAt(column);
  return (
    <>
      {before}
      <span
        className={`inline-block min-w-[1ch] ${
          pending ? "border-b-[3px] border-amber" : "bg-amber text-canvas"
        } ${char === "" ? "h-[30px] translate-y-1.5" : ""}`}
      >
        {char}
      </span>
      {line.slice(column + 1)}
    </>
  );
}
