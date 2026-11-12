import { z } from "zod";
export const penaltyKinds = [
  "warning",
  "final-warning",
  "point-deduction",
  "score-adjustment",
  "match-forfeit",
  "player-suspension",
  "team-suspension",
  "player-disqualification",
  "team-disqualification",
  "tournament-ban",
] as const;
export const ruleSchema = z.object({
  key: z.string().trim().min(1).max(40),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(10000),
  category: z.string().trim().min(2).max(100),
  entity: z.enum([
    "player",
    "team",
    "coach",
    "manager",
    "spectator",
    "official",
    "any-participant",
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  conditions: z.string().trim().min(3).max(5000),
  penalty: z.enum(penaltyKinds),
  evidence: z.string().trim().min(3).max(5000),
  escalation: z.array(z.enum(penaltyKinds)).max(20).default([]),
  appealEligible: z.boolean().default(true),
});
export const publishRulebookSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    effectiveAt: z.iso.datetime({ offset: true }),
    requireRenewal: z.boolean(),
    rules: z.array(ruleSchema).min(1).max(500),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.rules.map((r) => r.key)).size !== v.rules.length)
      ctx.addIssue({
        code: "custom",
        message: "Rule IDs must be unique in a version.",
        path: ["rules"],
      });
  });
export function applicableVersion<T extends { effectiveAt: Date; version: number }>(
  versions: T[],
  at: Date,
): T | undefined {
  return versions
    .filter((v) => v.effectiveAt <= at)
    .sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime() || b.version - a.version)[0];
}
