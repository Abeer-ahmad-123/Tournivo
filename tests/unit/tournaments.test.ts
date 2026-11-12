import { describe, expect, it } from "vitest";
import { getFormat } from "@/modules/tournaments/registry";
import { type Structure, type FormatId } from "@/modules/tournaments/types";
const entrants = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, name: `Entrant ${i + 1}`, seed: i + 1 }));
function playAll(structure: Structure) {
  let current = structure;
  for (let n = 0; n < 10000; n++) {
    const ready = current.matches.find((m) => m.status === "ready");
    if (!ready) return current;
    current = getFormat(current.format).advance(current, { matchId: ready.id, scores: [2, 1] });
  }
  throw new Error("Progression did not terminate.");
}
describe("single elimination", () => {
  it.each([2, 3, 5, 8, 11, 16, 31, 64, 127, 256])(
    "%i entrants have exactly N-1 played matches and one champion",
    (n) => {
      const bracket = getFormat("single-elimination").generate(entrants(n));
      const final = playAll(bracket);
      expect(final.matches.filter((m) => m.status === "completed")).toHaveLength(n - 1);
      expect(final.championId).toBeTruthy();
      expect(final.matches.every((m) => ["bye", "completed"].includes(m.status))).toBe(true);
      expect(
        final.matches
          .filter((m) => m.status === "completed")
          .every(
            (m) =>
              m.participants[0] && m.participants[1] && m.participants[0] !== m.participants[1],
          ),
      ).toBe(true);
    },
  );
  it("8-team bracket has 4 quarterfinals, 2 semifinals and 1 final", () => {
    const b = getFormat("single-elimination").generate(entrants(8));
    expect([1, 2, 3].map((r) => b.matches.filter((m) => m.round === r).length)).toEqual([4, 2, 1]);
  });
  it("11-team bracket gives 5 byes and never invents played results", () => {
    const b = getFormat("single-elimination").generate(entrants(11));
    expect(b.matches.filter((m) => m.status === "bye")).toHaveLength(5);
    expect(b.matches.filter((m) => m.status === "completed")).toHaveLength(0);
  });
  it("rejects duplicate result, draw, invalid score and unresolved match", () => {
    const f = getFormat("single-elimination"),
      b = f.generate(entrants(8)),
      id = b.matches[0].id;
    expect(() => f.advance(b, { matchId: id, scores: [1, 1] })).toThrow(/winner/);
    expect(() => f.advance(b, { matchId: id, scores: [-1, 0] })).toThrow(/Scores/);
    expect(() => f.advance(b, { matchId: b.matches.at(-1)!.id, scores: [1, 0] })).toThrow(/ready/);
    const next = f.advance(b, { matchId: id, scores: [2, 0] });
    expect(() => f.advance(next, { matchId: id, scores: [2, 0] })).toThrow(/unrecorded/);
    expect(b.matches[0].status).toBe("ready"); // Immutable engine input.
  });
  it("advances explicit withdrawal forfeit without deleting the entrant", () => {
    const f = getFormat("single-elimination"),
      b = f.generate(entrants(8)),
      m = b.matches[0];
    const after = f.advance(b, {
      matchId: m.id,
      scores: [0, 1],
      forfeitWinnerId: m.participants[1]!,
    });
    expect(after.entrants).toHaveLength(8);
    expect(after.matches[0].winnerId).toBe(m.participants[1]);
  });
});
describe("league formats", () => {
  it.each([
    ["round-robin", 8, 28],
    ["round-robin", 7, 21],
    ["round-robin", 3, 3],
    ["double-round-robin", 10, 90],
    ["double-round-robin", 9, 72],
  ] as [FormatId, number, number][])("%s with %i entrants has %i matches", (id, n, count) => {
    const b = getFormat(id).generate(entrants(n));
    expect(b.matches).toHaveLength(count);
    const pairs = new Map<string, number>();
    for (const m of b.matches) {
      const key = [...m.participants].sort().join("|");
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
      expect(new Set(m.participants).size).toBe(2);
    }
    expect([...pairs.values()].every((c) => c === (id === "round-robin" ? 1 : 2))).toBe(true);
    for (const round of new Set(b.matches.map((m) => m.round))) {
      const ids = b.matches.filter((m) => m.round === round).flatMap((m) => m.participants);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("double round robin reverses home and away", () => {
    const b = getFormat("double-round-robin").generate(entrants(10));
    for (const m of b.matches.slice(0, 45))
      expect(
        b.matches.some(
          (other) =>
            other.participants[0] === m.participants[1] &&
            other.participants[1] === m.participants[0],
        ),
      ).toBe(true);
  });
  it("calculates configurable points and preserves tied ranks", () => {
    const f = getFormat("round-robin");
    let b = f.generate(entrants(3));
    for (const m of b.matches) b = f.advance(b, { matchId: m.id, scores: [1, 1] });
    const standings = f.calculateStandings!(b, { win: 2, draw: 1, loss: 0 });
    expect(standings.map((s) => [s.played, s.points, s.rank])).toEqual([
      [2, 2, 1],
      [2, 2, 1],
      [2, 2, 1],
    ]);
  });
});
it("rejects insufficient, duplicate or ineligible entrants and unsupported strategies", () => {
  const f = getFormat("single-elimination");
  expect(() => f.generate(entrants(1))).toThrow();
  expect(() =>
    f.generate([
      { id: "a", name: "A" },
      { id: "a", name: "B" },
    ]),
  ).toThrow(/unique/);
  expect(() =>
    f.generate([
      { id: "a", name: "A", eligible: false },
      { id: "b", name: "B" },
    ]),
  ).toThrow(/eligible/);
  expect(() => getFormat("swiss")).toThrow(/not yet/);
});

describe("double elimination", () => {
  it.each([2, 3, 5, 8, 11, 16, 31, 64])(
    "%i entrants finish with every non-champion losing exactly twice",
    (n) => {
      const final = playAll(getFormat("double-elimination").generate(entrants(n)));
      const played = final.matches.filter((m) => m.status === "completed");
      expect(played.length).toBeGreaterThanOrEqual(2 * n - 2);
      expect(played.length).toBeLessThanOrEqual(2 * n - 1);
      expect(final.championId).toBeTruthy();
      for (const e of final.entrants) {
        const losses = played.filter(
          (m) => m.participants.includes(e.id) && m.winnerId !== e.id,
        ).length;
        expect(losses, e.id).toBe(e.id === final.championId ? 0 : 2);
      }
      expect(
        played.every(
          (m) => m.participants.every(Boolean) && m.participants[0] !== m.participants[1],
        ),
      ).toBe(true);
    },
  );
  it("16-team lower-bracket champion must win the grand final twice", () => {
    const f = getFormat("double-elimination");
    let b = f.generate(entrants(16));
    while (b.matches.some((m) => m.status === "ready")) {
      const m = b.matches.find((m) => m.status === "ready")!;
      b = f.advance(b, { matchId: m.id, scores: m.stage === "grand-final" ? [0, 1] : [1, 0] });
    }
    expect(b.matches.filter((m) => m.status === "completed")).toHaveLength(31);
    expect(b.matches.find((m) => m.stage === "grand-final-reset")?.status).toBe("completed");
    const losses = b.matches.filter(
      (m) =>
        m.status === "completed" &&
        m.participants.includes(b.championId!) &&
        m.winnerId !== b.championId,
    ).length;
    expect(losses).toBe(1);
  });
  it("random upsets retain the two-loss invariant", () => {
    let random = 7;
    const draw = () => (random = (random * 16807) % 2147483647) % 2;
    for (let run = 0; run < 20; run++) {
      const f = getFormat("double-elimination");
      let b = f.generate(entrants(16));
      while (b.matches.some((m) => m.status === "ready")) {
        const m = b.matches.find((m) => m.status === "ready")!;
        b = f.advance(b, { matchId: m.id, scores: draw() ? [1, 0] : [0, 1] });
      }
      expect(b.championId).toBeTruthy();
      for (const e of b.entrants) {
        const losses = b.matches.filter(
          (m) => m.status === "completed" && m.participants.includes(e.id) && m.winnerId !== e.id,
        ).length;
        expect(losses).toBe(
          e.id === b.championId
            ? b.matches.find((m) => m.id === "grand-final-reset")?.status === "completed"
              ? 1
              : 0
            : 2,
        );
      }
    }
  });
});
describe("group stage followed by knockout", () => {
  it.each([4, 5, 8, 11, 16])(
    "%i entrants generate two complete groups and a three-match playoff",
    (n) => {
      const f = getFormat("group-stage-knockout"),
        b = f.generate(entrants(n)),
        a = Math.ceil(n / 2),
        c = Math.floor(n / 2);
      expect(b.matches).toHaveLength((a * (a - 1)) / 2 + (c * (c - 1)) / 2 + 3);
      expect(
        b.matches.filter((m) => m.stage === "knockout").every((m) => m.status === "pending"),
      ).toBe(true);
      const final = playAll(b);
      expect(final.championId).toBeTruthy();
      expect(final.matches.every((m) => m.status === "completed")).toBe(true);
    },
  );
  it("uses original seed as a published final tiebreak and crosses qualifiers", () => {
    const f = getFormat("group-stage-knockout");
    let b = f.generate(entrants(8));
    for (const m of b.matches.filter((m) => m.stage.startsWith("group-")))
      b = f.advance(b, { matchId: m.id, scores: [0, 0] });
    expect(b.matches.find((m) => m.id === "ko-semi-1")?.participants).toEqual(["e1", "e4"]);
    expect(b.matches.find((m) => m.id === "ko-semi-2")?.participants).toEqual(["e2", "e3"]);
    expect(() => f.advance(b, { matchId: "ko-semi-1", scores: [1, 1] })).toThrow(/winner/);
  });
});
