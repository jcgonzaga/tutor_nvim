import type { ComboResult, XpAward } from "@tutor-nvim/pedagogy";
import { describeCombo, describeParts } from "./messages";

interface RewardLineProps {
  readonly award: XpAward;
  /** Only inside a session: free practice has no combo. */
  readonly combo?: ComboResult;
}

/** XP and combo after an attempt (PRD 39). Words and symbols, never colour alone. */
export function RewardLine({ award, combo }: RewardLineProps) {
  return (
    <div data-testid="reward" className="space-y-1 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-4">
        <span data-testid="reward-xp" className="font-semibold">
          {award.total > 0 ? `+${award.total} XP` : "+0 XP"}
        </span>
        {combo ? (
          <span data-testid="reward-combo">
            <span aria-hidden>{combo.change.kind === "reset" ? "↺ " : "⚡ "}</span>
            {describeCombo(combo)}
          </span>
        ) : null}
      </p>
      {award.total > 0 ? (
        <p data-testid="reward-parts" className="text-zinc-400">
          {describeParts(award).join(" · ")}
          {award.repeatFactor < 1 ? " · repeated today: reduced" : ""}
          {award.capped ? " · daily XP limit reached" : ""}
        </p>
      ) : (
        <p className="text-zinc-400">
          XP rewards solved exercises. Mastery is separate: it only grows with practice.
        </p>
      )}
    </div>
  );
}
