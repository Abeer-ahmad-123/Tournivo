import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  uniqueIndex,
  index,
  foreignKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { EngineMatch } from "@/modules/tournaments/types";

const time = (name: string) => timestamp(name, { withTimezone: true });
const created = () => time("created_at").notNull().defaultNow();
const identity = () => uuid("id").primaryKey().defaultRandom();
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: time("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: time("access_token_expires_at"),
    refreshTokenExpiresAt: time("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("account_provider_unique").on(t.providerId, t.accountId),
    index("account_user_idx").on(t.userId),
  ],
);
export const verification = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: time("expires_at").notNull(),
  createdAt: created(),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const organizations = pgTable("organizations", {
  id: identity(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: created(),
});
export const organizationMembers = pgTable(
  "organization_members",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("org_user_unique").on(t.organizationId, t.userId),
    index("membership_user_idx").on(t.userId),
  ],
);
export const sports = pgTable("sports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  suggestedRoster: integer("suggested_roster"),
  suggestedSubstitutes: integer("suggested_substitutes"),
  competitionType: text("competition_type").notNull(),
  presets: jsonb("presets").$type<Record<string, unknown>>().notNull().default({}),
});
export const tournaments = pgTable(
  "tournaments",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull().default(""),
    sportId: text("sport_id").references(() => sports.id),
    format: text("format").notNull().default("single-elimination"),
    status: text("status").notNull().default("draft"),
    visibility: text("visibility").notNull().default("private"),
    participantType: text("participant_type").notNull().default("team"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    draft: jsonb("draft").$type<Record<string, unknown>>().notNull().default({}),
    revision: integer("revision").notNull().default(0),
    championId: uuid("champion_id"),
    deletedAt: time("deleted_at"),
    createdAt: created(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("tournament_org_identity").on(t.id, t.organizationId),
    index("tournament_org_idx").on(t.organizationId, t.status),
  ],
);
export const tournamentMembers = pgTable(
  "tournament_members",
  {
    id: identity(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").notNull(),
  },
  (t) => [unique("tournament_member_unique").on(t.tournamentId, t.userId)],
);
export const stages = pgTable(
  "tournament_stages",
  {
    id: identity(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id),
    name: text("name").notNull(),
    format: text("format").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [unique("stage_position_unique").on(t.tournamentId, t.position)],
);
export const teams = pgTable(
  "teams",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    shortName: text("short_name"),
    managerId: text("manager_id").references(() => user.id),
    createdAt: created(),
  },
  (t) => [
    unique("team_org_identity").on(t.id, t.organizationId),
    unique("team_name_unique").on(t.organizationId, t.name),
  ],
);
export const players = pgTable(
  "players",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").references(() => user.id),
    name: text("name").notNull(),
    createdAt: created(),
  },
  (t) => [unique("player_org_identity").on(t.id, t.organizationId)],
);
export const teamRosters = pgTable(
  "team_rosters",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    teamId: uuid("team_id").notNull(),
    playerId: uuid("player_id").notNull(),
    role: text("role").notNull().default("player"),
    active: boolean("active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [
    unique("team_player_unique").on(t.teamId, t.playerId),
    foreignKey({
      columns: [t.teamId, t.organizationId],
      foreignColumns: [teams.id, teams.organizationId],
    }),
    foreignKey({
      columns: [t.playerId, t.organizationId],
      foreignColumns: [players.id, players.organizationId],
    }),
  ],
);
export const participants = pgTable(
  "participants",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    tournamentId: uuid("tournament_id").notNull(),
    teamId: uuid("team_id"),
    playerId: uuid("player_id"),
    name: text("name").notNull(),
    seed: integer("seed").notNull(),
    eligibility: text("eligibility").notNull().default("eligible"),
    createdAt: created(),
  },
  (t) => [
    unique("participant_tournament_identity").on(t.id, t.tournamentId),
    unique("participant_seed_unique").on(t.tournamentId, t.seed),
    unique("participant_team_unique").on(t.tournamentId, t.teamId),
    unique("participant_player_unique").on(t.tournamentId, t.playerId),
    foreignKey({
      columns: [t.tournamentId, t.organizationId],
      foreignColumns: [tournaments.id, tournaments.organizationId],
    }),
    foreignKey({
      columns: [t.teamId, t.organizationId],
      foreignColumns: [teams.id, teams.organizationId],
    }),
    foreignKey({
      columns: [t.playerId, t.organizationId],
      foreignColumns: [players.id, players.organizationId],
    }),
    check("participant_entity", sql`num_nonnulls(${t.teamId}, ${t.playerId}) = 1`),
  ],
);
export const matches = pgTable(
  "matches",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    tournamentId: uuid("tournament_id").notNull(),
    key: text("key").notNull(),
    round: integer("round").notNull(),
    position: integer("position").notNull(),
    stage: text("stage").notNull(),
    sources: jsonb("sources").$type<EngineMatch["sources"]>().notNull(),
    participantA: uuid("participant_a"),
    participantB: uuid("participant_b"),
    status: text("status").$type<EngineMatch["status"]>().notNull(),
    scores: jsonb("scores").$type<[number, number]>(),
    winnerId: uuid("winner_id"),
    refereeId: text("referee_id").references(() => user.id),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [
    unique("match_key_unique").on(t.tournamentId, t.key),
    unique("match_tournament_identity").on(t.id, t.tournamentId),
    foreignKey({
      columns: [t.tournamentId, t.organizationId],
      foreignColumns: [tournaments.id, tournaments.organizationId],
    }),
    foreignKey({
      columns: [t.participantA, t.tournamentId],
      foreignColumns: [participants.id, participants.tournamentId],
    }),
    foreignKey({
      columns: [t.participantB, t.tournamentId],
      foreignColumns: [participants.id, participants.tournamentId],
    }),
    foreignKey({
      columns: [t.winnerId, t.tournamentId],
      foreignColumns: [participants.id, participants.tournamentId],
    }),
  ],
);
export const matchResults = pgTable(
  "match_results",
  {
    id: identity(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => user.id),
    scores: jsonb("scores").$type<[number, number]>().notNull(),
    winnerId: uuid("winner_id").references(() => participants.id),
    reason: text("reason"),
    revision: integer("revision").notNull(),
    createdAt: created(),
  },
  (t) => [unique("result_revision_unique").on(t.matchId, t.revision)],
);
export const venues = pgTable(
  "venues",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    kind: text("kind").notNull().default("court"),
    availability: jsonb("availability")
      .$type<{ start: string; end: string }[]>()
      .notNull()
      .default([]),
  },
  (t) => [unique("venue_org_identity").on(t.id, t.organizationId)],
);
export const schedules = pgTable(
  "schedules",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    tournamentId: uuid("tournament_id").notNull(),
    matchId: uuid("match_id").notNull().unique(),
    venueId: uuid("venue_id").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [
    foreignKey({
      columns: [t.tournamentId, t.organizationId],
      foreignColumns: [tournaments.id, tournaments.organizationId],
    }),
    foreignKey({
      columns: [t.matchId, t.tournamentId],
      foreignColumns: [matches.id, matches.tournamentId],
    }),
    foreignKey({
      columns: [t.venueId, t.organizationId],
      foreignColumns: [venues.id, venues.organizationId],
    }),
    check("schedule_interval", sql`${t.endsAt} > ${t.startsAt}`),
    index("schedule_venue_time_idx").on(t.venueId, t.startsAt),
  ],
);
export const rulebooks = pgTable(
  "rulebooks",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    tournamentId: uuid("tournament_id").notNull().unique(),
    title: text("title").notNull(),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.tournamentId, t.organizationId],
      foreignColumns: [tournaments.id, tournaments.organizationId],
    }),
  ],
);
export const rulebookVersions = pgTable(
  "rulebook_versions",
  {
    id: identity(),
    rulebookId: uuid("rulebook_id")
      .notNull()
      .references(() => rulebooks.id),
    version: integer("version").notNull(),
    effectiveAt: time("effective_at").notNull(),
    publishedBy: text("published_by")
      .notNull()
      .references(() => user.id),
    requireRenewal: boolean("require_renewal").notNull().default(true),
    createdAt: created(),
  },
  (t) => [unique("rulebook_version_unique").on(t.rulebookId, t.version)],
);
export const customRules = pgTable(
  "custom_rules",
  {
    id: identity(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => rulebookVersions.id),
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    entity: text("entity").notNull(),
    severity: text("severity").notNull(),
    conditions: text("conditions").notNull(),
    penalty: text("penalty").notNull(),
    evidence: text("evidence").notNull(),
    escalation: jsonb("escalation").$type<string[]>().notNull().default([]),
    appealEligible: boolean("appeal_eligible").notNull().default(true),
  },
  (t) => [unique("version_rule_key_unique").on(t.versionId, t.key)],
);
export const acknowledgements = pgTable(
  "rule_acknowledgements",
  {
    id: identity(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => rulebookVersions.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    acceptedAt: created(),
  },
  (t) => [unique("ack_version_user_unique").on(t.versionId, t.userId)],
);
export const disciplinaryCases = pgTable(
  "disciplinary_cases",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    tournamentId: uuid("tournament_id").notNull(),
    participantId: uuid("participant_id").notNull(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => customRules.id),
    reportedBy: text("reported_by")
      .notNull()
      .references(() => user.id),
    reviewerId: text("reviewer_id").references(() => user.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("submitted"),
    response: text("response"),
    revision: integer("revision").notNull().default(0),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      columns: [t.tournamentId, t.organizationId],
      foreignColumns: [tournaments.id, tournaments.organizationId],
    }),
    foreignKey({
      columns: [t.participantId, t.tournamentId],
      foreignColumns: [participants.id, participants.tournamentId],
    }),
    index("case_org_status_idx").on(t.organizationId, t.status),
  ],
);
export const evidence = pgTable("disciplinary_evidence", {
  id: identity(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => disciplinaryCases.id),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => user.id),
  objectKey: text("object_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  createdAt: created(),
});
export const decisions = pgTable(
  "disciplinary_decisions",
  {
    id: identity(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => disciplinaryCases.id),
    decidedBy: text("decided_by")
      .notNull()
      .references(() => user.id),
    explanation: text("explanation").notNull(),
    penalty: text("penalty").notNull(),
    policy: text("policy").notNull(),
    appealDeadline: time("appeal_deadline"),
    appliedRevision: integer("applied_revision").notNull(),
    snapshot: jsonb("snapshot").$type<import("@/modules/tournaments/types").Structure>().notNull(),
    createdAt: created(),
  },
  (t) => [unique("case_decision_unique").on(t.caseId)],
);
export const penalties = pgTable("penalties", {
  id: identity(),
  decisionId: uuid("decision_id")
    .notNull()
    .unique()
    .references(() => decisions.id),
  participantId: uuid("participant_id")
    .notNull()
    .references(() => participants.id),
  kind: text("kind").notNull(),
  previousEligibility: text("previous_eligibility").notNull(),
  appliedAt: created(),
  reversedAt: time("reversed_at"),
});
export const appeals = pgTable("appeals", {
  id: identity(),
  decisionId: uuid("decision_id")
    .notNull()
    .unique()
    .references(() => decisions.id),
  submittedBy: text("submitted_by")
    .notNull()
    .references(() => user.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("submitted"),
  reviewerId: text("reviewer_id").references(() => user.id),
  explanation: text("explanation"),
  baselineRevision: integer("baseline_revision").notNull(),
  createdAt: created(),
  decidedAt: time("decided_at"),
});
export const notifications = pgTable(
  "notifications",
  {
    id: identity(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    message: text("message").notNull(),
    readAt: time("read_at"),
    createdAt: created(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.createdAt)],
);
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    entityId: text("entity_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("audit_org_time_idx").on(t.organizationId, t.createdAt)],
);
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: identity(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: text("key").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    fingerprint: text("fingerprint").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("idempotency_org_key_unique").on(t.organizationId, t.key)],
);
export const apiLimits = pgTable("api_rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull(),
  resetsAt: time("resets_at").notNull(),
});
