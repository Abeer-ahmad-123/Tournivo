import { z } from "zod";

export const maxRandomTeamPlayers = 256;
const playerName = z.string().trim().min(1, "Enter a player name.").max(120);
export const randomTeamSettingsSchema = z
  .object({
    playerNames: z
      .array(playerName)
      .min(2, "Enter at least two players.")
      .max(maxRandomTeamPlayers),
    splitMode: z.enum(["team-count", "team-size"]),
    splitValue: z.number().int().min(1, "Choose at least one.").max(maxRandomTeamPlayers),
  })
  .superRefine((settings, ctx) => {
    if (settings.splitMode === "team-count" && settings.splitValue > settings.playerNames.length) {
      ctx.addIssue({
        code: "custom",
        path: ["splitValue"],
        message: "You cannot have more teams than players.",
      });
    }
  });
export type RandomTeamSettings = z.infer<typeof randomTeamSettingsSchema>;
export function randomTeamCount(settings: RandomTeamSettings) {
  return settings.splitMode === "team-count"
    ? settings.splitValue
    : Math.ceil(settings.playerNames.length / settings.splitValue);
}
export const normalizeTeamName = (name: string) => name.trim().normalize("NFKC").toLowerCase();
export const generatedTeamSchema = z.object({
  name: z.string().trim().min(2).max(160),
  players: z
    .array(
      z.object({
        index: z
          .number()
          .int()
          .min(0)
          .max(maxRandomTeamPlayers - 1),
        name: playerName,
      }),
    )
    .min(1)
    .max(maxRandomTeamPlayers),
});
export type GeneratedTeam = z.infer<typeof generatedTeamSchema>;
export const randomTeamAssignmentSchema = randomTeamSettingsSchema
  .safeExtend({
    teams: z.array(generatedTeamSchema).min(1).max(maxRandomTeamPlayers),
  })
  .superRefine((assignment, ctx) => {
    const count = randomTeamCount(assignment);
    if (assignment.teams.length !== count)
      ctx.addIssue({
        code: "custom",
        path: ["teams"],
        message: "The team count does not match your split settings.",
      });
    const names = assignment.teams.map((team) => normalizeTeamName(team.name));
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: "custom",
        path: ["teams"],
        message: "Generated team names must be unique.",
      });
    const seen = new Set<number>();
    const minimum = Math.floor(assignment.playerNames.length / count),
      maximum = Math.ceil(assignment.playerNames.length / count);
    for (const team of assignment.teams) {
      if (team.players.length < minimum || team.players.length > maximum)
        ctx.addIssue({
          code: "custom",
          path: ["teams"],
          message: "Players must be distributed as evenly as possible.",
        });
      for (const player of team.players) {
        if (seen.has(player.index) || assignment.playerNames[player.index] !== player.name)
          ctx.addIssue({
            code: "custom",
            path: ["teams"],
            message: "Each entered player must appear exactly once, with their original name.",
          });
        seen.add(player.index);
      }
    }
    if (seen.size !== assignment.playerNames.length)
      ctx.addIssue({
        code: "custom",
        path: ["teams"],
        message: "Some entered players are missing from the teams.",
      });
  });

const adjectives = [
  "Azure",
  "Crimson",
  "Golden",
  "Silver",
  "Emerald",
  "Scarlet",
  "Midnight",
  "Arctic",
  "Swift",
  "Brave",
  "Mighty",
  "Wild",
  "Royal",
  "Rising",
  "Cosmic",
  "Thunder",
  "Storm",
  "Blazing",
  "Radiant",
  "Electric",
  "Iron",
  "Rapid",
  "Valiant",
  "Lunar",
];
const mascots = [
  "Falcons",
  "Tigers",
  "Wolves",
  "Dragons",
  "Eagles",
  "Panthers",
  "Lions",
  "Hawks",
  "Ravens",
  "Foxes",
  "Bears",
  "Sharks",
  "Vipers",
  "Owls",
  "Jaguars",
  "Cobras",
  "Stallions",
  "Bisons",
  "Lynxes",
  "Orcas",
  "Pumas",
  "Badgers",
  "Kestrels",
  "Leopards",
];
type RandomIndex = (exclusiveMaximum: number) => number;

// Fisher–Yates uses a server-supplied crypto.randomInt. The injectable source lets
// tests verify permutations and edge cases without relying on chance.
export function generateRandomTeams(
  settings: RandomTeamSettings,
  existingNames: string[],
  randomIndex: RandomIndex,
): GeneratedTeam[] {
  const valid = randomTeamSettingsSchema.parse(settings);
  const players = valid.playerNames.map((name, index) => ({ index, name }));
  for (let i = players.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [players[i], players[j]] = [players[j], players[i]];
  }
  const used = new Set(existingNames.map(normalizeTeamName));
  const teams: GeneratedTeam[] = Array.from({ length: randomTeamCount(valid) }, () => {
    const base = `${adjectives[randomIndex(adjectives.length)]} ${mascots[randomIndex(mascots.length)]}`;
    let name = base,
      suffix = 2;
    while (used.has(normalizeTeamName(name))) name = `${base} ${suffix++}`;
    used.add(normalizeTeamName(name));
    return { name, players: [] };
  });
  players.forEach((player, i) => teams[i % teams.length].players.push(player));
  return randomTeamAssignmentSchema.parse({ ...valid, teams }).teams;
}
