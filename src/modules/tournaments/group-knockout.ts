import { roundRobin } from "./round-robin";
import { singleElimination } from "./single-elimination";
import {
  CompetitionError,
  validateEntrants,
  type EngineMatch,
  type Source,
  type Structure,
  type TournamentFormat,
} from "./types";
const league = roundRobin(1);
function resolve(structure: Structure) {
  const groupMatches = structure.matches.filter((m) => m.stage.startsWith("group-"));
  if (!groupMatches.every((m) => m.status === "completed")) return structure;
  const qualifiers = new Map<string, string[]>();
  const needsQualification = structure.matches.some(
    (m) =>
      m.sources.some((source) => source && "group" in source) &&
      m.participants.some((id) => id === null),
  );
  for (const group of needsQualification ? ["group-A", "group-B"] : []) {
    const matches = groupMatches.filter((m) => m.stage === group),
      ids = new Set(matches.flatMap((m) => m.participants));
    const entrants = structure.entrants.filter((e) => ids.has(e.id));
    const rankings = league.calculateStandings!(
      { ...structure, format: "round-robin", entrants, matches },
      { win: 3, draw: 1, loss: 0 },
    ).filter((row) => entrants.find((e) => e.id === row.entrantId)?.eligible !== false);
    if (rankings.length < 2)
      throw new CompetitionError(
        "A group has fewer than two eligible qualifiers. Organizer resolution is required.",
      );
    // The published final tiebreak is initial seed, so qualification never relies on arbitrary IDs.
    rankings.sort(
      (a, b) =>
        a.rank - b.rank ||
        (entrants.find((e) => e.id === a.entrantId)?.seed ?? 0) -
          (entrants.find((e) => e.id === b.entrantId)?.seed ?? 0),
    );
    qualifiers.set(
      group,
      rankings.map((r) => r.entrantId),
    );
  }
  for (const m of structure.matches.filter((m) => m.stage === "knockout")) {
    if (m.status === "completed") continue;
    // Once qualified, a withdrawal follows the explicit future-forfeit policy.
    // Qualification corrections clear these slots before resolving them again.
    if (m.sources.some((source) => source && "group" in source) && m.participants.every(Boolean))
      continue;
    const values = m.sources.map((source) => {
      if (source && "group" in source)
        return qualifiers.get(source.group)?.[source.rank - 1] ?? null;
      if (source && "matchId" in source) {
        const dep = structure.matches.find((m) => m.id === source.matchId);
        return dep?.status === "completed" ? (dep.winnerId ?? null) : null;
      }
      return source && "entrantId" in source ? source.entrantId : null;
    }) as [string | null, string | null];
    m.participants = values;
    m.status = values.every(Boolean) ? "ready" : "pending";
  }
  const final = structure.matches.at(-1)!;
  structure.championId = final.status === "completed" ? final.winnerId : null;
  return structure;
}
export const groupKnockout: TournamentFormat = {
  id: "group-stage-knockout",
  validate(entrants) {
    validateEntrants(entrants);
    if (entrants.length < 4 || entrants.length > 64)
      throw new CompetitionError("Two-group knockout needs 4 to 64 entrants.");
  },
  generate(entrants) {
    this.validate(entrants);
    const seeded = [...entrants].map((e, i) => ({ ...e, seed: e.seed ?? i + 1 })),
      groups = [seeded.filter((_, i) => i % 2 === 0), seeded.filter((_, i) => i % 2 === 1)];
    const groupMatches = groups.flatMap((group, i) =>
      league.generate(group).matches.map((m) => ({
        ...m,
        id: `g${i + 1}-${m.id}`,
        stage: i === 0 ? "group-A" : "group-B",
      })),
    );
    const offset = Math.max(...groupMatches.map((m) => m.round));
    const knockout: EngineMatch[] = [
      {
        id: "ko-semi-1",
        round: offset + 1,
        position: 0,
        stage: "knockout",
        sources: [
          { group: "group-A", rank: 1 },
          { group: "group-B", rank: 2 },
        ],
        participants: [null, null],
        status: "pending",
      },
      {
        id: "ko-semi-2",
        round: offset + 1,
        position: 1,
        stage: "knockout",
        sources: [
          { group: "group-B", rank: 1 },
          { group: "group-A", rank: 2 },
        ],
        participants: [null, null],
        status: "pending",
      },
      {
        id: "ko-final",
        round: offset + 2,
        position: 0,
        stage: "knockout",
        sources: [
          { matchId: "ko-semi-1", outcome: "winner" },
          { matchId: "ko-semi-2", outcome: "winner" },
        ],
        participants: [null, null],
        status: "pending",
      },
    ];
    return {
      format: "group-stage-knockout",
      entrants: seeded,
      matches: [...groupMatches, ...knockout],
      revision: 0,
    };
  },
  advance(structure, result) {
    const m = structure.matches.find((m) => m.id === result.matchId);
    if (!m) throw new CompetitionError("Match not found.");
    if (m.stage.startsWith("group-"))
      return resolve({ ...league.advance(structure, result), format: this.id });
    // Use the elimination strategy only on knockout matches, retaining group qualification sources.
    const eligible = structure.matches
      .filter((m) => m.stage === "knockout")
      .map((m) => ({
        ...m,
        sources: m.sources.map((s) =>
          s && "group" in s ? { entrantId: m.participants[m.sources.indexOf(s)]! } : s,
        ) as [Source, Source],
      }));
    const progressed = singleElimination.advance(
      { ...structure, format: "single-elimination", matches: eligible },
      result,
    );
    const next = structuredClone(structure);
    for (const changed of progressed.matches) {
      const target = next.matches.find((m) => m.id === changed.id)!;
      Object.assign(target, { ...changed, sources: target.sources });
    }
    next.revision = progressed.revision;
    return resolve(next);
  },
};
