import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { invariant } from "./errors";
import { evidenceStorageConfigured } from "@/modules/discipline/evidence-storage";

export async function getWorkspace(actorId: string, requestedOrganizationId?: string) {
  const memberships = await db
    .select({
      id: s.organizations.id,
      name: s.organizations.name,
      slug: s.organizations.slug,
      role: s.organizationMembers.role,
    })
    .from(s.organizationMembers)
    .innerJoin(s.organizations, eq(s.organizations.id, s.organizationMembers.organizationId))
    .where(eq(s.organizationMembers.userId, actorId))
    .orderBy(asc(s.organizations.createdAt));
  const organization = requestedOrganizationId
    ? memberships.find((o) => o.id === requestedOrganizationId)
    : memberships[0];
  invariant(!requestedOrganizationId || organization, 403, "Organization access denied.");
  const catalog = await db.select().from(s.sports).orderBy(asc(s.sports.name));
  if (!organization)
    return {
      actorId,
      organizations: memberships,
      organization: null,
      catalog,
      tournaments: [],
      teams: [],
      rosters: [],
      players: [],
      venues: [],
      matches: [],
      schedules: [],
      participants: [],
      cases: [],
      audit: [],
      notifications: [],
      members: [],
      assignments: [],
    };
  const org = organization.id,
    privileged = ["owner", "organizer", "admin"].includes(organization.role);
  const activeTournaments = db
    .select({ id: s.tournaments.id })
    .from(s.tournaments)
    .where(and(eq(s.tournaments.organizationId, org), isNull(s.tournaments.deletedAt)));
  const assignments = await db
    .select({
      id: s.tournamentMembers.id,
      userId: s.tournamentMembers.userId,
      role: s.tournamentMembers.role,
      tournamentId: s.tournamentMembers.tournamentId,
    })
    .from(s.tournamentMembers)
    .innerJoin(s.tournaments, eq(s.tournaments.id, s.tournamentMembers.tournamentId))
    .where(and(eq(s.tournaments.organizationId, org), isNull(s.tournaments.deletedAt)));
  const [
    tournaments,
    teams,
    rosters,
    players,
    venues,
    matches,
    schedules,
    participants,
    cases,
    audit,
    notifications,
    members,
  ] = await Promise.all([
    db
      .select()
      .from(s.tournaments)
      .where(and(eq(s.tournaments.organizationId, org), isNull(s.tournaments.deletedAt)))
      .orderBy(desc(s.tournaments.createdAt)),
    db.select().from(s.teams).where(eq(s.teams.organizationId, org)).orderBy(asc(s.teams.name)),
    db.select().from(s.teamRosters).where(eq(s.teamRosters.organizationId, org)),
    db.select().from(s.players).where(eq(s.players.organizationId, org)),
    db.select().from(s.venues).where(eq(s.venues.organizationId, org)),
    db
      .select()
      .from(s.matches)
      .where(
        and(eq(s.matches.organizationId, org), inArray(s.matches.tournamentId, activeTournaments)),
      )
      .orderBy(asc(s.matches.round), asc(s.matches.position)),
    db
      .select()
      .from(s.schedules)
      .where(
        and(
          eq(s.schedules.organizationId, org),
          inArray(s.schedules.tournamentId, activeTournaments),
        ),
      )
      .orderBy(asc(s.schedules.startsAt)),
    db
      .select()
      .from(s.participants)
      .where(
        and(
          eq(s.participants.organizationId, org),
          inArray(s.participants.tournamentId, activeTournaments),
        ),
      ),
    db
      .select()
      .from(s.disciplinaryCases)
      .where(
        and(
          eq(s.disciplinaryCases.organizationId, org),
          inArray(s.disciplinaryCases.tournamentId, activeTournaments),
        ),
      )
      .orderBy(desc(s.disciplinaryCases.createdAt)),
    privileged
      ? db
          .select()
          .from(s.auditLogs)
          .where(eq(s.auditLogs.organizationId, org))
          .orderBy(desc(s.auditLogs.createdAt))
          .limit(40)
      : Promise.resolve([]),
    db
      .select()
      .from(s.notifications)
      .where(and(eq(s.notifications.organizationId, org), eq(s.notifications.userId, actorId)))
      .orderBy(desc(s.notifications.createdAt))
      .limit(30),
    privileged
      ? db
          .select({
            id: s.user.id,
            name: s.user.name,
            email: s.user.email,
            role: s.organizationMembers.role,
          })
          .from(s.organizationMembers)
          .innerJoin(s.user, eq(s.user.id, s.organizationMembers.userId))
          .where(eq(s.organizationMembers.organizationId, org))
      : Promise.resolve([]),
  ]);
  const allowedCases = cases.filter(
    (c) =>
      ["owner", "organizer"].includes(organization.role) ||
      assignments.some(
        (a) => a.tournamentId === c.tournamentId && a.userId === actorId && a.role === "admin",
      ) ||
      c.reportedBy === actorId ||
      participants.some(
        (p) =>
          p.id === c.participantId &&
          (teams.some((team) => team.id === p.teamId && team.managerId === actorId) ||
            players.some((player) => player.id === p.playerId && player.userId === actorId)),
      ),
  );
  return {
    actorId,
    organizations: memberships,
    organization,
    catalog,
    tournaments: privileged
      ? tournaments
      : tournaments
          .filter((t) => t.status !== "draft")
          .map((t) => ({
            ...t,
            draft: {} as Record<string, unknown>,
            config: {
              points: t.config.points,
              timezone: t.config.timezone,
              durationMinutes: t.config.durationMinutes,
              restMinutes: t.config.restMinutes,
            } as Record<string, unknown>,
          })),
    teams,
    rosters,
    players,
    venues,
    matches,
    schedules,
    participants,
    cases: allowedCases,
    audit,
    notifications,
    members,
    assignments: privileged ? assignments : assignments.filter((a) => a.userId === actorId),
  };
}

export async function getTournamentDetail(actorId: string, tournamentId: string) {
  const [tournament] = await db
    .select()
    .from(s.tournaments)
    .where(and(eq(s.tournaments.id, tournamentId), isNull(s.tournaments.deletedAt)));
  invariant(tournament, 404, "Tournament not found.");
  const [member] = await db
    .select()
    .from(s.organizationMembers)
    .where(
      and(
        eq(s.organizationMembers.organizationId, tournament.organizationId),
        eq(s.organizationMembers.userId, actorId),
      ),
    );
  invariant(member, 403, "Tournament access denied.");
  const [book] = await db
    .select()
    .from(s.rulebooks)
    .where(eq(s.rulebooks.tournamentId, tournamentId));
  const versions = book
    ? await db
        .select()
        .from(s.rulebookVersions)
        .where(eq(s.rulebookVersions.rulebookId, book.id))
        .orderBy(desc(s.rulebookVersions.version))
    : [];
  const rules = versions.length
    ? await db
        .select()
        .from(s.customRules)
        .where(
          inArray(
            s.customRules.versionId,
            versions.map((v) => v.id),
          ),
        )
    : [];
  const acknowledgements = versions.length
    ? await db
        .select()
        .from(s.acknowledgements)
        .where(
          and(
            inArray(
              s.acknowledgements.versionId,
              versions.map((v) => v.id),
            ),
            eq(s.acknowledgements.userId, actorId),
          ),
        )
    : [];
  const [assigned] = await db
    .select()
    .from(s.tournamentMembers)
    .where(
      and(
        eq(s.tournamentMembers.tournamentId, tournamentId),
        eq(s.tournamentMembers.userId, actorId),
      ),
    );
  const canReview = ["owner", "organizer"].includes(member.role) || assigned?.role === "admin";
  const allCases = await db
    .select()
    .from(s.disciplinaryCases)
    .where(eq(s.disciplinaryCases.tournamentId, tournamentId));
  const [entrants, teams, players] = await Promise.all([
    db.select().from(s.participants).where(eq(s.participants.tournamentId, tournamentId)),
    db.select().from(s.teams).where(eq(s.teams.organizationId, tournament.organizationId)),
    db.select().from(s.players).where(eq(s.players.organizationId, tournament.organizationId)),
  ]);
  const cases = allCases.filter(
    (c) =>
      canReview ||
      c.reportedBy === actorId ||
      entrants.some(
        (p) =>
          p.id === c.participantId &&
          (teams.some((team) => team.id === p.teamId && team.managerId === actorId) ||
            players.some((player) => player.id === p.playerId && player.userId === actorId)),
      ),
  );
  const decisions = cases.length
    ? await db
        .select()
        .from(s.decisions)
        .where(
          inArray(
            s.decisions.caseId,
            cases.map((c) => c.id),
          ),
        )
    : [];
  const appeals = decisions.length
    ? await db
        .select()
        .from(s.appeals)
        .where(
          inArray(
            s.appeals.decisionId,
            decisions.map((d) => d.id),
          ),
        )
    : [];
  const evidence = cases.length
    ? await db
        .select({
          id: s.evidence.id,
          caseId: s.evidence.caseId,
          uploadedBy: s.evidence.uploadedBy,
          mimeType: s.evidence.mimeType,
          size: s.evidence.size,
          createdAt: s.evidence.createdAt,
        })
        .from(s.evidence)
        .where(
          inArray(
            s.evidence.caseId,
            cases.map((c) => c.id),
          ),
        )
    : [];
  return {
    book: book ?? null,
    versions,
    rules,
    acknowledgements,
    cases,
    decisions: decisions.map(({ snapshot: _snapshot, ...decision }) => decision),
    appeals,
    evidence,
    evidenceConfigured: evidenceStorageConfigured(),
  };
}

export async function getPublicTournament(slug: string) {
  const [t] = await db
    .select({
      id: s.tournaments.id,
      name: s.tournaments.name,
      slug: s.tournaments.slug,
      description: s.tournaments.description,
      sportId: s.tournaments.sportId,
      format: s.tournaments.format,
      status: s.tournaments.status,
      championId: s.tournaments.championId,
    })
    .from(s.tournaments)
    .where(
      and(
        eq(s.tournaments.slug, slug),
        eq(s.tournaments.visibility, "public"),
        isNull(s.tournaments.deletedAt),
      ),
    );
  if (!t || t.status === "draft") return null;
  const [entrants, matches, schedule, books] = await Promise.all([
    db
      .select({ id: s.participants.id, name: s.participants.name, seed: s.participants.seed })
      .from(s.participants)
      .where(eq(s.participants.tournamentId, t.id))
      .orderBy(asc(s.participants.seed)),
    db
      .select({
        key: s.matches.key,
        round: s.matches.round,
        position: s.matches.position,
        stage: s.matches.stage,
        sources: s.matches.sources,
        participantA: s.matches.participantA,
        participantB: s.matches.participantB,
        status: s.matches.status,
        scores: s.matches.scores,
        winnerId: s.matches.winnerId,
      })
      .from(s.matches)
      .where(eq(s.matches.tournamentId, t.id))
      .orderBy(asc(s.matches.round), asc(s.matches.position)),
    db
      .select({
        matchKey: s.matches.key,
        startsAt: s.schedules.startsAt,
        endsAt: s.schedules.endsAt,
        venue: s.venues.name,
      })
      .from(s.schedules)
      .innerJoin(s.matches, eq(s.matches.id, s.schedules.matchId))
      .innerJoin(s.venues, eq(s.venues.id, s.schedules.venueId))
      .where(eq(s.schedules.tournamentId, t.id)),
    db.select().from(s.rulebooks).where(eq(s.rulebooks.tournamentId, t.id)),
  ]);
  const versions = books[0]
    ? await db
        .select({
          id: s.rulebookVersions.id,
          version: s.rulebookVersions.version,
          effectiveAt: s.rulebookVersions.effectiveAt,
        })
        .from(s.rulebookVersions)
        .where(eq(s.rulebookVersions.rulebookId, books[0].id))
        .orderBy(desc(s.rulebookVersions.version))
    : [];
  const current = versions.find((v) => v.effectiveAt <= new Date());
  const rules = current
    ? await db
        .select({
          key: s.customRules.key,
          title: s.customRules.title,
          description: s.customRules.description,
          category: s.customRules.category,
          entity: s.customRules.entity,
          severity: s.customRules.severity,
          conditions: s.customRules.conditions,
          penalty: s.customRules.penalty,
          evidence: s.customRules.evidence,
          escalation: s.customRules.escalation,
          appealEligible: s.customRules.appealEligible,
        })
        .from(s.customRules)
        .where(eq(s.customRules.versionId, current.id))
    : [];
  const [points] = await db
    .select({ config: s.tournaments.config })
    .from(s.tournaments)
    .where(eq(s.tournaments.id, t.id));
  return {
    tournament: t,
    entrants,
    matches,
    schedule,
    rulebook: current
      ? { version: current.version, effectiveAt: current.effectiveAt, rules }
      : null,
    points: (points?.config.points as { win: number; draw: number; loss: number } | undefined) ?? {
      win: 3,
      draw: 1,
      loss: 0,
    },
  };
}
export type Jsonify<T> = T extends Date
  ? string
  : T extends readonly unknown[]
    ? { [K in keyof T]: Jsonify<T[K]> }
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;
export type Workspace = Jsonify<Awaited<ReturnType<typeof getWorkspace>>>;
export type TournamentDetail = Jsonify<Awaited<ReturnType<typeof getTournamentDetail>>>;
