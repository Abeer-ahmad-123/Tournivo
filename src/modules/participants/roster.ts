import { z } from "zod";
export const rosterPolicySchema = z
  .object({
    minimum: z.number().int().min(1).max(1000).optional(),
    maximum: z.number().int().min(1).max(1000).optional(),
    activeLineup: z.number().int().min(1).max(1000).optional(),
    substitutes: z.number().int().min(0).max(1000).optional(),
    equalSizes: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.minimum !== undefined && v.maximum !== undefined && v.minimum > v.maximum)
      ctx.addIssue({
        code: "custom",
        message: "Minimum cannot exceed maximum.",
        path: ["minimum"],
      });
    if (v.maximum !== undefined && v.activeLineup !== undefined && v.activeLineup > v.maximum)
      ctx.addIssue({
        code: "custom",
        message: "Active lineup exceeds the configured maximum.",
        path: ["activeLineup"],
      });
  });
export type RosterPolicy = z.infer<typeof rosterPolicySchema>;
export function validateRosters(sizes: number[], policy: RosterPolicy): string[] {
  rosterPolicySchema.parse(policy);
  const errors: string[] = [];
  sizes.forEach((size, i) => {
    if (!Number.isSafeInteger(size) || size < 0) errors.push(`Roster ${i + 1}: invalid size.`);
    if (policy.minimum !== undefined && size < policy.minimum)
      errors.push(`Roster ${i + 1}: below configured minimum.`);
    if (policy.maximum !== undefined && size > policy.maximum)
      errors.push(`Roster ${i + 1}: above configured maximum.`);
    if (policy.activeLineup !== undefined && size < policy.activeLineup)
      errors.push(`Roster ${i + 1}: fewer players than the active lineup.`);
  });
  if (policy.equalSizes && new Set(sizes).size > 1)
    errors.push("The organizer requires equal roster sizes.");
  return errors;
}
