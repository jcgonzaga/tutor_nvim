import {
  DEFAULT_PEDAGOGY_CONFIG,
  getUserSkill,
  masteryBlockers,
  resolveStages,
} from "@tutor-nvim/pedagogy";
import { findSkill, skills, skillTitle } from "../exercises";
import { formatWhen } from "../format";
import { useProfile } from "../profile/ProfileProvider";
import { Page } from "../ui/Page";
import { cardClass, linkClass } from "../ui/styles";
import { STAGE_DISPLAY } from "./stages";

/** What the learner has shown for one skill. Each dimension is a number, a bar and a word. */
const DIMENSIONS = [
  ["mastery", "Mastery"],
  ["accuracy", "Accuracy"],
  ["strategy", "Strategy"],
  ["fluency", "Fluency"],
  ["retention", "Retention"],
  ["transfer", "Transfer"],
] as const;

export function SkillDetailScreen({ slug }: { readonly slug: string }) {
  const { profile, clock } = useProfile();
  const skill = findSkill(slug);
  if (!skill) {
    return (
      <Page title="Skill not found">
        <a href="#/map" className={linkClass}>
          Back to the skill map
        </a>
      </Page>
    );
  }

  const now = clock.now();
  const stages = resolveStages(skills, profile.learner, DEFAULT_PEDAGOGY_CONFIG);
  const stage = stages[slug] ?? "locked";
  const display = STAGE_DISPLAY[stage];
  const state = getUserSkill(profile.learner, slug);
  const blockers = masteryBlockers(state, DEFAULT_PEDAGOGY_CONFIG);
  const dependents = skills.filter((other) => other.prerequisites.includes(slug));
  const placed = profile.learner.placed?.includes(slug) === true;

  return (
    <Page title={skill.title} eyebrow="Skill">
      <p className="text-zinc-300">{skill.description}</p>
      <p data-testid="skill-stage" data-stage={stage} className="font-semibold">
        <span aria-hidden>{display.icon} </span>
        {display.label}
      </p>

      {stage === "locked" ? (
        <p data-testid="skill-locked-reason" className="text-zinc-300">
          Locked until you practice: {skill.prerequisites.map(skillTitle).join(", ")}.
        </p>
      ) : (
        <>
          {placed && state.attemptCount === 0 ? (
            <p className="text-sm text-zinc-400">
              The starting check placed you past this skill. It has no evidence yet, so practice it
              to make it count.
            </p>
          ) : null}
          <dl
            className={`${cardClass} grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2`}
          >
            {DIMENSIONS.map(([key, label]) => (
              <div key={key} className="contents">
                <dt className="text-zinc-400">{label}</dt>
                <dd className="h-2 rounded bg-zinc-800">
                  <div
                    className="h-2 rounded bg-sky-400"
                    style={{ width: `${Math.round(state[key])}%` }}
                  />
                </dd>
                <dd data-testid={`skill-${key}`} className="font-mono text-sm">
                  {Math.round(state[key])}
                </dd>
              </div>
            ))}
          </dl>

          <dl className={`${cardClass} grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm`}>
            <dt className="text-zinc-400">Attempts</dt>
            <dd data-testid="skill-attempts">{state.attemptCount}</dd>
            <dt className="text-zinc-400">Next review</dt>
            <dd data-testid="skill-next-review">
              {state.nextReviewAt === null
                ? "Not scheduled yet"
                : formatWhen(state.nextReviewAt, now)}
            </dd>
          </dl>

          {stage !== "mastered" && blockers.length > 0 ? (
            <section aria-labelledby="blockers-heading" className="space-y-1">
              <h2 id="blockers-heading" className="font-semibold">
                To master it
              </h2>
              <ul data-testid="skill-blockers" className="list-disc pl-6 text-sm text-zinc-300">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
              <p className="text-xs text-zinc-400">
                Mastery needs a successful review after time away and the skill in another context:
                repeating it today is not enough.
              </p>
            </section>
          ) : null}
        </>
      )}

      {skill.prerequisites.length > 0 && stage !== "locked" ? (
        <p className="text-sm text-zinc-400">
          Builds on: {skill.prerequisites.map(skillTitle).join(", ")}.
        </p>
      ) : null}
      {dependents.length > 0 ? (
        <p className="text-sm text-zinc-400">
          Leads to: {dependents.map((other) => other.title).join(", ")}.
        </p>
      ) : null}

      <a href="#/map" className={linkClass}>
        Back to the skill map
      </a>
    </Page>
  );
}
