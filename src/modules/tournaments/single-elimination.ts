import {
  CompetitionError,
  validateEntrants,
  validateScore,
  type EngineMatch,
  type Source,
  type Structure,
  type TournamentFormat,
} from "./types";

function sourceValue(
  source: Source,
  structure: Structure,
): { resolved: boolean; id: string | null } {
  if (!source) return { resolved: true, id: null };
  if ("entrantId" in source) return { resolved: true, id: source.entrantId };
  if (!("matchId" in source)) return { resolved: false, id: null };
  const match = structure.matches.find((m) => m.id === source.matchId);
  if (!match || !["completed", "bye"].includes(match.status)) return { resolved: false, id: null };
  return { resolved: true, id: match.winnerId ?? null };
}
export function resolveElimination(structure: Structure): Structure {
  for (const match of structure.matches) {
    if (match.status === "completed") continue;
    const a = sourceValue(match.sources[0], structure),
      b = sourceValue(match.sources[1], structure);
    match.participants = [a.id, b.id];
    if (!a.resolved || !b.resolved) {
      match.status = "pending";
      continue;
    }
    if (!a.id || !b.id) {
      match.status = "bye";
      match.winnerId = a.id ?? b.id;
    } else {
      match.status = "ready";
      match.winnerId = undefined;
    }
  }
  const final = structure.matches.at(-1);
  structure.championId =
    final && ["completed", "bye"].includes(final.status) ? final.winnerId : null;
  return structure;
}
// Standard recursive seed placement distributes byes across the bracket.
function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    seeds = seeds.flatMap((n) => [n, sum - n]);
  }
  return seeds;
}
export const singleElimination: TournamentFormat = {
  id: "single-elimination",
  validate: validateEntrants,
  generate(entrants) {
    validateEntrants(entrants);
    const sorted = [...entrants].sort(
      (a, b) => (a.seed ?? entrants.indexOf(a) + 1) - (b.seed ?? entrants.indexOf(b) + 1),
    );
    const size = 2 ** Math.ceil(Math.log2(entrants.length)),
      seeds = seedOrder(size);
    const matches: EngineMatch[] = [];
    let previous: EngineMatch[] = [];
    for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) {
      const current: EngineMatch[] = [];
      for (let i = 0; i < count; i++) {
        const source = (offset: number): Source =>
          round === 1
            ? sorted[seeds[i * 2 + offset] - 1]
              ? { entrantId: sorted[seeds[i * 2 + offset] - 1].id }
              : null
            : { matchId: previous[i * 2 + offset].id, outcome: "winner" };
        current.push({
          id: `r${round}-m${i + 1}`,
          round,
          position: i,
          stage: "knockout",
          sources: [source(0), source(1)],
          participants: [null, null],
          status: "pending",
        });
      }
      matches.push(...current);
      previous = current;
    }
    return resolveElimination({ format: "single-elimination", entrants, matches, revision: 0 });
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
      throw new CompetitionError("Forfeit winner must be a match participant.");
    match.scores = result.scores;
    match.status = "completed";
    match.winnerId =
      result.forfeitWinnerId ?? match.participants[result.scores[0] > result.scores[1] ? 0 : 1];
    next.revision++;
    return resolveElimination(next);
  },
};
