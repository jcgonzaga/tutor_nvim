/** English text of the map area (skill map and skill detail). */
export const map = {
  title: "Skill map",
  lead: (count: number) =>
    `${count} skills. Each one unlocks when you practice the ones it builds on. Select a skill for details.`,
  legend: "Legend",
  step: (n: number) => `Step ${n}`,
  reviewDue: "Review due",
  backToToday: "Back to today",
  detail: {
    eyebrow: "Skill",
    notFound: "Skill not found",
    backToMap: "Back to the skill map",
    masteryOutOf: "/ 100",
    lockedReason: (prerequisites: string) => `Locked until you practice: ${prerequisites}.`,
    placedNote:
      "The starting check placed you past this skill. It has no evidence yet, so practice it to make it count.",
    dimensions: {
      accuracy: "Accuracy",
      strategy: "Strategy",
      fluency: "Fluency",
      retention: "Retention",
      transfer: "Transfer",
    },
    attempts: "Attempts",
    nextReview: "Next review",
    notScheduled: "Not scheduled yet",
    toMaster: "To master it",
    masteryNote:
      "Mastery needs a successful review after time away and the skill in another context: repeating it today is not enough.",
    requires: "Requires",
    leadsTo: "Leads to",
    /**
     * The criteria `masteryBlockers` (pedagogy) names, keyed by the English name it reports. A
     * blocker reads "<criterion> <value> < <minimum>".
     */
    blockerCriteria: {
      mastery: "mastery",
      accuracy: "accuracy",
      strategy: "strategy",
      transfer: "transfer",
      retention: "retention",
      "delayed recalls": "delayed recalls",
      "transfer exercises": "transfer exercises",
    },
  },
};
