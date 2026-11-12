import {
  CompetitionError,
  validateEntrants,
  validateScore,
  type EngineMatch,
  type Standing,
  type TournamentFormat,
} from "./types";

export function roundRobin(cycles: 1 | 2): TournamentFormat {
  return {
    id: cycles === 1 ? "round-robin" : "double-round-robin",
    validate: validateEntrants,
    generate(entrants) {
      validateEntrants(entrants);
      const rotation: (string | null)[] = entrants.map((e) => e.id);
      if (rotation.length % 2) rotation.push(null);
      const matches: EngineMatch[] = [],
        rounds = rotation.length - 1;
      for (let cycle = 0; cycle < cycles; cycle++) {
        const ring = [...rotation];
        for (let r = 0; r < rounds; r++) {
          for (let i = 0; i < ring.length / 2; i++) {
            const a = ring[i],
              b = ring[ring.length - 1 - i];
            if (!a || !b) continue;
            const pair: [string, string] = (r + cycle) % 2 ? [b, a] : [a, b];
            const round = cycle * rounds + r + 1;
            matches.push({
              id: `r${round}-m${i + 1}`,
              round,
              position: i,
              stage: "league",
              sources: [{ entrantId: pair[0] }, { entrantId: pair[1] }],
              participants: pair,
              status: "ready",
            });
          }
          ring.splice(1, 0, ring.pop()!);
        }
      }
      return { format: this.id, entrants, matches, revision: 0 };
    },
    advance(structure, result) {
      const next = structuredClone(structure),
        match = next.matches.find((m) => m.id === result.matchId);
      if (!match || match.status !== "ready")
        throw new CompetitionError("Only ready, unrecorded matches can receive a result.");
      validateScore(result.scores);
      if (result.forfeitWinnerId && !match.participants.includes(result.forfeitWinnerId))
        throw new CompetitionError("Invalid forfeit winner.");
      match.scores = result.scores;
      match.status = "completed";
      match.winnerId =
        result.forfeitWinnerId ??
        (result.scores[0] === result.scores[1]
          ? null
          : match.participants[result.scores[0] > result.scores[1] ? 0 : 1]);
      next.revision++;
      return next;
    },
    calculateStandings(structure, points) {
      if (Object.values(points).some((v) => !Number.isFinite(v)))
        throw new CompetitionError("Invalid scoring points.");
      const rows = new Map(
        structure.entrants.map((e) => [
          e.id,
          {
            entrantId: e.id,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            for: 0,
            against: 0,
            difference: 0,
            points: 0,
            rank: 0,
          } satisfies Standing,
        ]),
      );
      for (const match of structure.matches) {
        if (match.status !== "completed" || !match.scores) continue;
        match.participants.forEach((id, index) => {
          const row = id ? rows.get(id) : undefined;
          if (!row) return;
          row.played++;
          row.for += match.scores![index];
          row.against += match.scores![1 - index];
          row.difference = row.for - row.against;
          if (match.winnerId === id) {
            row.won++;
            row.points += points.win;
          } else if (match.winnerId === null) {
            row.drawn++;
            row.points += points.draw;
          } else {
            row.lost++;
            row.points += points.loss;
          }
        });
      }
      const ordered: Standing[] = [...rows.values()].sort(
        (a, b) =>
          b.points - a.points ||
          b.difference - a.difference ||
          b.for - a.for ||
          a.entrantId.localeCompare(b.entrantId),
      );
      ordered.forEach((row, i) => {
        const prev = ordered[i - 1];
        row.rank =
          prev &&
          prev.points === row.points &&
          prev.difference === row.difference &&
          prev.for === row.for
            ? prev.rank
            : i + 1;
      });
      return ordered;
    },
  };
}
