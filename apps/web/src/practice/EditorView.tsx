import type { Position, VimMode } from "@tutor-nvim/vim-engine";

interface EditorViewProps {
  readonly lines: readonly string[];
  readonly cursor: Position;
  readonly mode: VimMode;
}

/**
 * Renders the buffer. The cursor never relies on colour alone: NORMAL draws a
 * block over the character, INSERT draws a bar between characters. The text
 * content of the buffer is always exactly the buffer text.
 */
export function EditorView({ lines, cursor, mode }: EditorViewProps) {
  return (
    <div data-testid="buffer" className="font-mono text-lg leading-7">
      {lines.map((line, index) => (
        <div key={index} className="min-h-7 whitespace-pre">
          {index === cursor.line ? (
            <CursorLine line={line} column={cursor.column} mode={mode} />
          ) : (
            line
          )}
        </div>
      ))}
    </div>
  );
}

function CursorLine({ line, column, mode }: { line: string; column: number; mode: VimMode }) {
  const before = line.slice(0, column);

  if (mode === "insert") {
    return (
      <>
        {before}
        <span
          aria-hidden
          className="-mx-px inline-block h-6 translate-y-1 border-l-2 border-amber-300"
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
        className={`inline-block min-w-[1ch] bg-zinc-100 text-zinc-950 ${char === "" ? "h-6 translate-y-1" : ""}`}
      >
        {char}
      </span>
      {line.slice(column + 1)}
    </>
  );
}
