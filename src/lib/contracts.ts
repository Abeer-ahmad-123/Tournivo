import { z } from "zod";
import { rosterPolicySchema } from "@/modules/participants/roster";
import { publishRulebookSchema, penaltyKinds } from "@/modules/rulebooks/rules";
import {
  randomTeamSettingsSchema,
  randomTeamAssignmentSchema,
} from "@/modules/participants/random-teams";
export const id = z.uuid();
const name = z.string().trim().min(2).max(160);
export const tournamentDraftSchema = z
  .object({
    name,
    description: z.string().max(10000).default(""),
    sportId: z.string().min(1).max(100),
    category: z.enum(["sport", "esport", "custom"]).default("sport"),
    format: z
      .enum([
        "single-elimination",
        "double-elimination",
        "round-robin",
        "double-round-robin",
        "group-stage-knockout",
      ])
      .default("single-elimination"),
    participantType: z
      .enum(["team", "individual", "doubles", "mixed-doubles", "relay", "custom"])
      .default("team"),
    entrantNames: z.array(name).min(2).max(256),
    roster: rosterPolicySchema,
    online: z.boolean().default(false),
    points: z
      .object({
        win: z.number().min(-1000).max(1000),
        draw: z.number().min(-1000).max(1000),
        loss: z.number().min(-1000).max(1000),
      })
      .default({ win: 3, draw: 1, loss: 0 }),
    durationMinutes: z.number().int().min(1).max(1440).default(60),
    restMinutes: z.number().int().min(0).max(1440).default(15),
    bestOf: z
      .number()
      .int()
      .min(1)
      .max(99)
      .refine((n) => n % 2 === 1, "Best of must be odd.")
      .default(1),
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Use a valid IANA timezone.")
      .default("UTC"),
    startsAt: z.string().max(100).default(""),
    endsAt: z.string().max(100).default(""),
    visibility: z.enum(["private", "public"]).default("private"),
    registration: z.enum(["manual", "public-approval", "public-open"]).default("manual"),
    registrationDeadline: z.string().max(100).default(""),
    rulebookNotes: z.string().max(10000).default(""),
    step: z.number().int().min(0).max(7).default(0),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.entrantNames.map((n) => n.toLowerCase())).size !== v.entrantNames.length)
      ctx.addIssue({
        code: "custom",
        message: "Entrant names must be unique.",
        path: ["entrantNames"],
      });
    for (const key of ["startsAt", "endsAt", "registrationDeadline"] as const)
      if (v[key] && !Number.isFinite(Date.parse(v[key])))
        ctx.addIssue({ code: "custom", message: "Use a valid date.", path: [key] });
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt))
      ctx.addIssue({ code: "custom", message: "End must be after start.", path: ["endsAt"] });
  });
export type TournamentDraft = z.infer<typeof tournamentDraftSchema>;
const scope = { organizationId: id };
const tour = { ...scope, tournamentId: id };
const revision = { expectedRevision: z.number().int().min(0) };
const keyed = { idempotencyKey: z.string().min(8).max(100) };
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("organization.create"), name }),
  z.object({
    action: z.literal("organization.member"),
    ...scope,
    email: z.email(),
    role: z.enum(["organizer", "admin", "referee", "manager", "player", "spectator"]),
  }),
  z.object({
    action: z.literal("tournament.save"),
    ...scope,
    tournamentId: id.optional(),
    ...revision,
    draft: tournamentDraftSchema,
  }),
  z.object({ action: z.literal("tournament.generate"), ...tour, ...revision, ...keyed }),
  z.object({
    action: z.literal("tournament.delete"),
    ...tour,
    ...revision,
    ...keyed,
    confirmationName: name,
  }),
  z.object({
    action: z.literal("tournament.publish"),
    ...tour,
    ...revision,
    visibility: z.enum(["private", "public"]),
  }),
  z.object({
    action: z.literal("match.result"),
    ...tour,
    ...revision,
    ...keyed,
    matchId: id,
    scores: z.tuple([z.number().int().min(0).max(100000), z.number().int().min(0).max(100000)]),
    forfeitWinnerId: id.optional(),
  }),
  z.object({
    action: z.literal("match.correct"),
    ...tour,
    ...revision,
    ...keyed,
    matchId: id,
    scores: z.tuple([z.number().int().min(0).max(100000), z.number().int().min(0).max(100000)]),
    reason: z.string().trim().min(10).max(2000),
  }),
  z.object({
    action: z.literal("team.create"),
    ...scope,
    name,
    shortName: z.string().max(8).optional(),
  }),
  z.object({ action: z.literal("teams.preview"), ...scope, settings: randomTeamSettingsSchema }),
  z.object({
    action: z.literal("teams.generate"),
    ...scope,
    ...keyed,
    assignment: randomTeamAssignmentSchema,
  }),
  z.object({ action: z.literal("team.assign-manager"), ...scope, teamId: id, userId: id }),
  z.object({
    action: z.literal("tournament.assign"),
    ...tour,
    userId: id,
    role: z.enum(["admin", "referee", "manager", "player", "spectator"]),
  }),
  z.object({ action: z.literal("match.assign"), ...tour, matchId: id, userId: id }),
  z.object({
    action: z.literal("roster.add"),
    ...scope,
    teamId: id,
    name,
    email: z.email().optional(),
    role: z.enum(["player", "captain", "substitute", "coach", "manager"]).default("player"),
  }),
  z.object({
    action: z.literal("venue.create"),
    ...scope,
    name,
    timezone: z.string().min(1).max(100),
    kind: z.enum(["court", "field", "server", "venue"]),
    availability: z
      .array(
        z.object({
          start: z.iso.datetime({ offset: true }),
          end: z.iso.datetime({ offset: true }),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({
    action: z.literal("schedule.generate"),
    ...tour,
    ...revision,
    ...keyed,
    venueIds: z.array(id).min(1).max(20),
    maxConcurrent: z.number().int().min(1).max(20),
  }),
  z.object({
    action: z.literal("rulebook.publish"),
    ...tour,
    ...revision,
    publication: publishRulebookSchema,
  }),
  z.object({ action: z.literal("rulebook.acknowledge"), ...tour, versionId: id }),
  z.object({
    action: z.literal("case.report"),
    ...tour,
    participantId: id,
    ruleId: id,
    title: name,
    description: z.string().trim().min(10).max(10000),
  }),
  z.object({
    action: z.literal("case.respond"),
    ...tour,
    caseId: id,
    response: z.string().trim().min(10).max(10000),
  }),
  z.object({
    action: z.literal("participant.withdraw"),
    ...tour,
    ...revision,
    ...keyed,
    participantId: id,
    policy: z.literal("preserve-results-forfeit-future"),
    reason: z.string().trim().min(10).max(2000),
  }),
  z.object({
    action: z.literal("participant.link-user"),
    ...tour,
    participantId: id,
    email: z.email(),
  }),
  z.object({
    action: z.literal("case.transition"),
    ...tour,
    caseId: id,
    status: z.enum([
      "under_review",
      "awaiting_response",
      "evidence_requested",
      "decision_pending",
      "dismissed",
      "closed",
    ]),
    ...revision,
  }),
  z.object({
    action: z.literal("case.decide"),
    ...tour,
    ...revision,
    ...keyed,
    caseId: id,
    explanation: z.string().trim().min(10).max(10000),
    penalty: z.enum(penaltyKinds),
    policy: z.enum(["none", "preserve-results-forfeit-future"]),
    appealDeadline: z.iso.datetime({ offset: true }).optional(),
  }),
  z.object({
    action: z.literal("appeal.submit"),
    ...tour,
    decisionId: id,
    reason: z.string().trim().min(10).max(10000),
  }),
  z.object({
    action: z.literal("appeal.decide"),
    ...tour,
    ...revision,
    ...keyed,
    appealId: id,
    approved: z.boolean(),
    explanation: z.string().trim().min(10).max(10000),
  }),
  z.object({ action: z.literal("notification.read"), ...scope, notificationId: id }),
]);
export type Command = z.infer<typeof commandSchema>;
