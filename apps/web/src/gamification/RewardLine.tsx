import type { ComboResult, XpAward } from "@tutor-nvim/pedagogy";
import { useT } from "../i18n/I18nProvider";
import { describeCombo, describeParts } from "./messages";

interface RewardLineProps {
  readonly award: XpAward;
  /** Only inside a session: free practice has no combo. */
  readonly combo?: ComboResult;
}

/** XP and combo after an attempt (PRD 39). Words and symbols, never colour alone. */
export function RewardLine({ award, combo }: RewardLineProps) {
  const t = useT();
  const words = t.gamification;
  return (
    <div data-testid="reward" className="space-y-1 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-4">
        <span data-testid="reward-xp" className="font-semibold">
          {words.reward.xp(award.total > 0 ? award.total : 0)}
        </span>
        {combo ? <span data-testid="reward-combo">{describeCombo(combo, words)}</span> : null}
      </p>
      {award.total > 0 ? (
        <p data-testid="reward-parts" className="text-ink-3">
          {describeParts(award, words).join(" · ")}
          {award.repeatFactor < 1 ? words.reward.repeated : ""}
          {award.capped ? words.reward.capped : ""}
        </p>
      ) : (
        <p className="text-ink-3">{words.reward.noXp}</p>
      )}
    </div>
  );
}
