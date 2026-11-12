import { describe, expect, it } from "vitest";
import {
  generateRandomTeams,
  randomTeamAssignmentSchema,
  randomTeamSettingsSchema,
} from "@/modules/participants/random-teams";
import { commandSchema } from "@/lib/contracts";

const names = (count: number) => Array.from({ length: count }, (_, i) => `Player ${i + 1}`);
const zero = () => 0;
describe("random team generation", () => {
  it.each([
    [8, 2],
    [11, 3],
    [7, 4],
    [2, 2],
    [256, 256],
    [8, 1],
  ])("assigns all %i players once across %i balanced teams", (count, teamCount) => {
    const settings = {
      playerNames: names(count),
      splitMode: "team-count" as const,
      splitValue: teamCount,
    };
    const teams = generateRandomTeams(settings, [], zero);
    expect(teams).toHaveLength(teamCount);
    const assigned = teams.flatMap((team) => team.players);
    expect(assigned.map((player) => player.index).sort((a, b) => a - b)).toEqual(
      Array.from({ length: count }, (_, i) => i),
    );
    expect(assigned.every((player) => player.name === settings.playerNames[player.index])).toBe(
      true,
    );
    const sizes = teams.map((team) => team.players.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
  it("uses the supplied random source to shuffle before assigning", () => {
    const settings = { playerNames: names(4), splitMode: "team-count" as const, splitValue: 2 };
    const teams = generateRandomTeams(settings, [], zero);
    expect(teams.map((team) => team.players.map((player) => player.index))).toEqual([
      [1, 3],
      [2, 0],
    ]);
    const different = generateRandomTeams(settings, [], (upper) => upper - 1);
    expect(different.map((team) => team.players.map((player) => player.index))).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });
  it("handles maximum team size without dropping remainder players", () => {
    const teams = generateRandomTeams(
      { playerNames: names(10), splitMode: "team-size", splitValue: 4 },
      [],
      zero,
    );
    expect(teams.map((team) => team.players.length)).toEqual([4, 3, 3]);
  });
  it("avoids existing names and repeated random-name collisions", () => {
    const teams = generateRandomTeams(
      { playerNames: names(6), splitMode: "team-count", splitValue: 3 },
      [" azure falcons ", "Azure Falcons 2"],
      zero,
    );
    expect(teams.map((team) => team.name)).toEqual([
      "Azure Falcons 3",
      "Azure Falcons 4",
      "Azure Falcons 5",
    ]);
  });
  it("preserves separate people who have the same name", () => {
    const teams = generateRandomTeams(
      { playerNames: ["Alex", " Alex ", "Sam"], splitMode: "team-count", splitValue: 2 },
      [],
      zero,
    );
    expect(
      teams.flatMap((team) => team.players).filter((player) => player.name === "Alex"),
    ).toHaveLength(2);
  });
  it("rejects empty names, invalid splits and resource limits", () => {
    for (const settings of [
      { playerNames: ["Alex"], splitMode: "team-count", splitValue: 2 },
      { playerNames: [" ", "Sam"], splitMode: "team-count", splitValue: 2 },
      { playerNames: names(3), splitMode: "team-count", splitValue: 4 },
      { playerNames: names(3), splitMode: "team-size", splitValue: 0 },
      { playerNames: names(3), splitMode: "team-count", splitValue: 1.5 },
      { playerNames: names(257), splitMode: "team-count", splitValue: 2 },
    ])
      expect(randomTeamSettingsSchema.safeParse(settings).success).toBe(false);
  });
  it("rejects modified assignments that lose, duplicate or rename players", () => {
    const settings = { playerNames: names(4), splitMode: "team-count" as const, splitValue: 2 };
    const valid = { ...settings, teams: generateRandomTeams(settings, [], zero) };
    const duplicate = structuredClone(valid);
    duplicate.teams[1].players[0] = duplicate.teams[0].players[0];
    const missing = structuredClone(valid);
    missing.teams[0].players.pop();
    const renamed = structuredClone(valid);
    renamed.teams[0].players[0].name = "Someone else";
    const sameNames = structuredClone(valid);
    sameNames.teams[1].name = sameNames.teams[0].name.toUpperCase();
    const unbalanced = structuredClone(valid);
    unbalanced.teams[0].players.push(unbalanced.teams[1].players.pop()!);
    for (const assignment of [duplicate, missing, renamed, sameNames, unbalanced])
      expect(randomTeamAssignmentSchema.safeParse(assignment).success).toBe(false);
  });
  it("validates complete save commands before they reach persistence", () => {
    expect(
      commandSchema.safeParse({
        action: "teams.generate",
        organizationId: "not-an-id",
        assignment: {},
      }).success,
    ).toBe(false);
  });
});
