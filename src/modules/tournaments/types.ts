export type FormatId =
  | "single-elimination"
  | "double-elimination"
  | "round-robin"
  | "double-round-robin"
  | "group-stage-knockout";
export type Entrant = { id: string; name: string; seed?: number; eligible?: boolean };
export type Source =
  | { entrantId: string }
  | { matchId: string; outcome: "winner" | "loser" }
  | { group: string; rank: number }
  | null;
export type EngineMatch = {
  id: string;
  round: number;
  position: number;
  stage: string;
  sources: [Source, Source];
  participants: [string | null, string | null];
  status: "pending" | "ready" | "completed" | "bye";
  scores?: [number, number];
  winnerId?: string | null;
};
export type Structure = {
  format: FormatId;
  entrants: Entrant[];
  matches: EngineMatch[];
  championId?: string | null;
  revision: number;
};
export type Score = { matchId: string; scores: [number, number]; forfeitWinnerId?: string };
export type Points = { win: number; draw: number; loss: number };
export type Standing = {
  entrantId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  for: number;
  against: number;
  difference: number;
  points: number;
  rank: number;
};
export interface TournamentFormat {
  id: FormatId;
  validate(entrants: Entrant[]): void;
  generate(entrants: Entrant[]): Structure;
  advance(structure: Structure, result: Score): Structure;
  calculateStandings?(structure: Structure, points: Points): Standing[];
}
export class CompetitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetitionError";
  }
}
export function validateEntrants(entrants: Entrant[]) {
  if (entrants.length < 2 || entrants.length > 256)
    throw new CompetitionError("Use between 2 and 256 entrants.");
  if (new Set(entrants.map((e) => e.id)).size !== entrants.length)
    throw new CompetitionError("Entrant IDs must be unique.");
  if (entrants.some((e) => !e.id || !e.name.trim() || e.eligible === false))
    throw new CompetitionError("Entrants must be named and eligible.");
}
export function validateScore(scores: [number, number]) {
  if (scores.some((s) => !Number.isSafeInteger(s) || s < 0 || s > 100000))
    throw new CompetitionError("Scores must be nonnegative integers up to 100000.");
}
