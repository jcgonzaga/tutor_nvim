import type { SessionRun } from "@tutor-nvim/pedagogy";
import { SESSION_BLOCKS } from "@tutor-nvim/pedagogy";
import { useT } from "../i18n/I18nProvider";

/** The shape of the session in progress: one bar per block, the one being played in amber. */
export function SessionBlocks({ run }: { readonly run: SessionRun }) {
  const t = useT();
  const counts = SESSION_BLOCKS.map((block) => ({
    block,
    total: run.plan[block].length,
    left: run.pending.filter((item) => item.block === block && !item.repeat).length,
  })).filter((entry) => entry.total > 0);
  const current = run.pending[0]?.block ?? null;

  return (
    <ol aria-label={t.home.blocks.aria} className="flex flex-wrap gap-1.5">
      {counts.map(({ block, total, left }) => {
        const label = t.home.blocks[block];
        const isCurrent = block === current;
        const done = left === 0;
        return (
          <li
            key={block}
            {...(isCurrent ? { "aria-current": "step" as const } : {})}
            style={{ flex: `${Math.max(total, 1)} 1 120px` }}
            className="flex flex-col gap-2.5"
          >
            <span
              aria-hidden
              className={`h-2 rounded ${isCurrent ? "bg-amber" : done ? "bg-ink-2" : "bg-line-strong"}`}
            />
            <span className="flex flex-col gap-0.5">
              <strong className={`text-[15px] ${isCurrent ? "text-amber" : ""}`}>
                {label.name}
                <span className="sr-only">
                  {done ? t.home.blocks.srDone : isCurrent ? t.home.blocks.srNow : ""}
                </span>
              </strong>
              <span className="text-sm text-ink-3">
                {done ? t.home.blocks.done : t.home.blocks.left(left)} · {label.hint}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
