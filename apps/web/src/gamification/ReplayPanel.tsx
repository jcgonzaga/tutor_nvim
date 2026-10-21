import { useEffect, useMemo, useState } from "react";
import { buildReplay } from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import { EditorView } from "../practice/EditorView";
import { secondaryButton } from "../ui/styles";

export interface ReplaySource {
  readonly id: string;
  readonly label: string;
  readonly keys: readonly string[];
  readonly times?: readonly number[];
}

const STEP_MS = 500;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Basic replay (T-806): step through a stored run on the exercise's own editor. It is manual by
 * default; "Play" only exists when the visitor has not asked for reduced motion. Each step is
 * announced, so it is usable without seeing the screen.
 */
export function ReplayPanel({
  exercise,
  sources,
}: {
  readonly exercise: Exercise;
  readonly sources: readonly ReplaySource[];
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const source = sources.find((candidate) => candidate.id === sourceId) ?? sources[0];
  const frames = useMemo(() => (source ? buildReplay(exercise, source) : []), [exercise, source]);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const last = Math.max(0, frames.length - 1);
  const frame = frames[Math.min(position, last)];

  // Playing stops by itself on the last step: no state is set to end it.
  const isPlaying = playing && position < last;
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => setPosition((current) => current + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, position]);

  if (!source || !frame) return null;

  const choose = (id: string) => {
    setSourceId(id);
    setPosition(0);
    setPlaying(false);
  };

  return (
    <section
      aria-label="Replay"
      data-testid="replay"
      className="space-y-3 border-t border-zinc-700 pt-3"
    >
      {sources.length > 1 ? (
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">Which run to replay</legend>
          {sources.map((option) => (
            <label key={option.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="replay-source"
                checked={option.id === source.id}
                onChange={() => choose(option.id)}
                className="size-4 accent-sky-400"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="rounded border border-zinc-700 bg-zinc-950 p-3" aria-hidden>
        <EditorView lines={frame.lines} cursor={frame.cursor} mode={frame.mode} />
      </div>
      <p className="font-mono text-xs text-zinc-400" aria-hidden>
        {frame.mode.toUpperCase()}
      </p>

      <p role="status" aria-live="polite" data-testid="replay-status" className="text-sm">
        {position === 0
          ? `Start. ${frames.length - 1} keys.`
          : `Step ${frame.index} of ${last}: ${frame.key}${frame.accepted ? "" : " (not accepted)"}.`}{" "}
        <span className="sr-only">
          Mode {frame.mode}. Text: {frame.lines.join(" / ")}
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setPosition(0)}
          disabled={position === 0}
        >
          Start
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setPosition((current) => Math.max(0, current - 1))}
          disabled={position === 0}
        >
          Back
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setPosition((current) => Math.min(last, current + 1))}
          disabled={position >= last}
        >
          Step
        </button>
        {reducedMotion ? null : (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              if (position >= last) {
                setPosition(0);
                setPlaying(true);
              } else {
                setPlaying(!isPlaying);
              }
            }}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
        )}
      </div>
    </section>
  );
}
