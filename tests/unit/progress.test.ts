import { describe, expect, it } from "vitest";
import { getFormat } from "@/modules/tournaments/registry";
import { tournamentProgress } from "@/modules/tournaments/progress";
import type { Structure } from "@/modules/tournaments/types";

const entrants = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `entrant-${index}`,
    name: `Entrant ${index}`,
    seed: index + 1,
  }));

describe("spectator progress", () => {
  it("excludes byes from an eleven-entrant bracket", () => {
    const structure = getFormat("single-elimination").generate(entrants(11));
    expect(tournamentProgress(structure)).toMatchObject({
      completed: 0,
      total: 10,
      percent: 0,
      currentRound: 1,
    });
  });
  it("follows round advancement and reaches 100 percent only after the final", () => {
    const format = getFormat("single-elimination");
    let structure = format.generate(entrants(4));
    for (let i = 0; i < 2; i++) {
      const match = structure.matches.find((match) => match.status === "ready")!;
      structure = format.advance(structure, { matchId: match.id, scores: [1, 0] });
    }
    expect(tournamentProgress(structure)).toEqual({
      completed: 2,
      total: 3,
      ready: 1,
      remaining: 1,
      percent: 67,
      currentRound: 2,
    });
    structure = format.advance(structure, {
      matchId: structure.matches.find((m) => m.status === "ready")!.id,
      scores: [1, 0],
    });
    expect(tournamentProgress(structure)).toMatchObject({
      percent: 100,
      remaining: 0,
      ready: 0,
      currentRound: null,
    });
  });
  it("does not count an unused conditional grand final reset", () => {
    const format = getFormat("double-elimination");
    let structure = format.generate(entrants(4));
    expect(tournamentProgress(structure).total).toBe(6);
    while (!structure.championId) {
      const match = structure.matches.find((m) => m.status === "ready")!;
      structure = format.advance(structure, { matchId: match.id, scores: [1, 0] });
    }
    expect(tournamentProgress(structure)).toMatchObject({ total: 6, completed: 6, percent: 100 });
  });
  it("adds a required reset and waits for its result", () => {
    const format = getFormat("double-elimination");
    let structure = format.generate(entrants(4));
    while (
      !structure.matches.some((m) => m.stage === "grand-final-reset" && m.status === "ready")
    ) {
      const match = structure.matches.find((m) => m.status === "ready")!;
      structure = format.advance(structure, {
        matchId: match.id,
        scores: match.stage === "grand-final" ? [0, 1] : [1, 0],
      });
    }
    expect(tournamentProgress(structure)).toMatchObject({
      total: 7,
      completed: 6,
      percent: 86,
      remaining: 1,
    });
    structure = format.advance(structure, { matchId: "grand-final-reset", scores: [1, 0] });
    expect(tournamentProgress(structure).percent).toBe(100);
  });
  it("does not round a nearly finished league to 100 percent", () => {
    const structure = getFormat("round-robin").generate(entrants(32));
    for (const match of structure.matches.slice(0, -1)) match.status = "completed";
    expect(tournamentProgress(structure)).toMatchObject({
      completed: 495,
      total: 496,
      percent: 99,
    });
  });
  it("handles an empty fixture list without NaN or fictional completion", () => {
    const structure: Structure = {
      format: "single-elimination",
      entrants: [],
      matches: [],
      revision: 0,
    };
    expect(tournamentProgress(structure)).toEqual({
      completed: 0,
      total: 0,
      ready: 0,
      remaining: 0,
      percent: 0,
      currentRound: null,
    });
  });
});
