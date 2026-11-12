import { singleElimination } from "./single-elimination";
import {
  CompetitionError,
  validateEntrants,
  validateScore,
  type EngineMatch,
  type Source,
  type Structure,
  type TournamentFormat,
} from "./types";

function resolveSource(
  source: Source,
  structure: Structure,
): { resolved: boolean; id: string | null } {
  if (!source) return { resolved: true, id: null };
  if ("entrantId" in source) return { resolved: true, id: source.entrantId };
  if (!("matchId" in source)) return { resolved: false, id: null };
  const match = structure.matches.find((m) => m.id === source.matchId);
  if (!match || !["bye", "completed"].includes(match.status)) return { resolved: false, id: null };
  if (source.outcome === "winner") return { resolved: true, id: match.winnerId ?? null };
  // A bye never creates a loss or a lower-bracket entrant.
  return {
    resolved: true,
    id:
      match.status === "bye"
        ? null
        : (match.participants.find((p) => p !== match.winnerId) ?? null),
  };
}
function resolve(structure: Structure) {
  for (const m of structure.matches) {
    if (m.status === "completed") continue;
    const a = resolveSource(m.sources[0], structure),
      b = resolveSource(m.sources[1], structure);
    m.participants = [a.id, b.id];
    if (!a.resolved || !b.resolved) {
      m.status = "pending";
      continue;
    }
    if (m.stage === "grand-final-reset") {
      const first = structure.matches.find((m) => m.stage === "grand-final")!;
      if (first.winnerId === first.participants[0]) {
        m.status = "bye";
        m.winnerId = first.winnerId;
        continue;
      }
    }
    if (!a.id || !b.id) {
      m.status = "bye";
      m.winnerId = a.id ?? b.id;
    } else {
      m.status = "ready";
      m.winnerId = undefined;
    }
  }
  const last = structure.matches.at(-1)!;
  structure.championId = ["completed", "bye"].includes(last.status) ? last.winnerId : null;
  return structure;
}
const from = (m: EngineMatch, outcome: "winner" | "loser" = "winner"): Source => ({
  matchId: m.id,
  outcome,
});
export const doubleElimination: TournamentFormat = {
  id: "double-elimination",
  validate: validateEntrants,
  generate(entrants) {
    validateEntrants(entrants);
    const winners = singleElimination.generate(entrants).matches.map((m) => ({
      ...m,
      id: `w-${m.id}`,
      stage: "winners",
      sources: m.sources.map((source) =>
        source && "matchId" in source ? { ...source, matchId: `w-${source.matchId}` } : source,
      ) as [Source, Source],
      status: "pending" as const,
      winnerId: undefined,
    }));
    const depth = Math.max(...winners.map((m) => m.round)),
      lower: EngineMatch[] = [];
    let previous: EngineMatch[] = [];
    for (let r = 1; r <= 2 * depth - 2; r++) {
      const count = 2 ** (depth - Math.ceil(r / 2) - 1),
        current: EngineMatch[] = [];
      for (let i = 0; i < count; i++) {
        let sources: [Source, Source];
        if (r === 1) {
          const wr = winners.filter((m) => m.round === 1);
          sources = [from(wr[i * 2], "loser"), from(wr[i * 2 + 1], "loser")];
        } else if (r % 2 === 1) sources = [from(previous[i * 2]), from(previous[i * 2 + 1])];
        else {
          const drop = winners.filter((m) => m.round === r / 2 + 1);
          const crossed = count > 1 ? i ^ 1 : i;
          sources = [from(previous[i]), from(drop[crossed], "loser")];
        }
        current.push({
          id: `l-r${r}-m${i + 1}`,
          round: depth + r,
          position: i,
          stage: "losers",
          sources,
          participants: [null, null],
          status: "pending",
        });
      }
      lower.push(...current);
      previous = current;
    }
    const winnerFinal = winners.at(-1)!;
    const final: EngineMatch = {
      id: "grand-final",
      round: depth * 3,
      position: 0,
      stage: "grand-final",
      sources: [from(winnerFinal), lower.length ? from(lower.at(-1)!) : from(winnerFinal, "loser")],
      participants: [null, null],
      status: "pending",
    };
    const reset: EngineMatch = {
      id: "grand-final-reset",
      round: depth * 3 + 1,
      position: 0,
      stage: "grand-final-reset",
      sources: [from(final), from(final, "loser")],
      participants: [null, null],
      status: "pending",
    };
    // Winners, lower bracket and finals are topologically ordered, independent of visual round labels.
    return resolve({
      format: "double-elimination",
      entrants,
      matches: [...winners, ...lower, final, reset],
      revision: 0,
    });
  },
  advance(structure, result) {
    const next = structuredClone(structure),
      match = next.matches.find((m) => m.id === result.matchId);
    if (!match || match.status !== "ready")
      throw new CompetitionError("Only ready, unrecorded matches can receive a result.");
    validateScore(result.scores);
    if (!result.forfeitWinnerId && result.scores[0] === result.scores[1])
      throw new CompetitionError("Elimination matches need a winner.");
    if (result.forfeitWinnerId && !match.participants.includes(result.forfeitWinnerId))
      throw new CompetitionError("Invalid forfeit winner.");
    match.scores = result.scores;
    match.status = "completed";
    match.winnerId =
      result.forfeitWinnerId ?? match.participants[result.scores[0] > result.scores[1] ? 0 : 1];
    next.revision++;
    return resolve(next);
  },
};
