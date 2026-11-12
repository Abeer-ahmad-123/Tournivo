import { CompetitionError } from "@/modules/tournaments/types";
export const transitions: Record<string, string[]> = {
  submitted: ["under_review", "awaiting_response", "dismissed"],
  under_review: ["awaiting_response", "evidence_requested", "decision_pending", "dismissed"],
  awaiting_response: ["under_review", "evidence_requested"],
  evidence_requested: ["under_review", "awaiting_response"],
  decision_pending: ["confirmed", "dismissed"],
  confirmed: ["appealed", "closed"],
  dismissed: ["closed"],
  appealed: ["appeal_approved", "appeal_rejected"],
  appeal_approved: ["closed"],
  appeal_rejected: ["closed"],
  closed: [],
};
export function assertCaseTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to))
    throw new CompetitionError(`Cannot move case from ${from} to ${to}.`);
}
export function planEligibilityPenalty(
  kind: string,
  policy: string,
  hasUnfinishedMatches: boolean,
) {
  if (["warning", "final-warning"].includes(kind))
    return { eligibility: null, applyForfeits: false };
  if (["point-deduction", "score-adjustment", "match-forfeit"].includes(kind))
    throw new CompetitionError(
      "This penalty needs an explicit match or standings adjustment; automatic application is unavailable.",
    );
  if (hasUnfinishedMatches && policy !== "preserve-results-forfeit-future")
    throw new CompetitionError("Confirm the future-forfeit policy before changing eligibility.");
  if (
    ![
      "player-suspension",
      "team-suspension",
      "player-disqualification",
      "team-disqualification",
      "tournament-ban",
    ].includes(kind)
  )
    throw new CompetitionError("Unknown penalty.");
  return {
    eligibility: kind.includes("suspension") ? "suspended" : "disqualified",
    applyForfeits: hasUnfinishedMatches,
  };
}
export function assertSafeReversal(
  originalDecisionMaker: string,
  reviewer: string,
  baselineRevision: number,
  currentRevision: number,
) {
  if (originalDecisionMaker === reviewer)
    throw new CompetitionError("An independent reviewer must decide the appeal.");
  if (baselineRevision !== currentRevision)
    throw new CompetitionError(
      "Tournament results changed after the decision. Organizer resolution is required before reversal.",
    );
}
