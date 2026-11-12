import { createHash, randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Transaction } from "@/db";
import * as s from "@/db/schema";
import { type Command, tournamentDraftSchema } from "./contracts";
import { AppError, invariant } from "./errors";
import { hasPermission, type Permission } from "./permissions";
import { getFormat } from "@/modules/tournaments/registry";
import { type EngineMatch, type FormatId, type Structure } from "@/modules/tournaments/types";
import { generateSchedule, type Schedulable } from "@/modules/scheduling/engine";
import {
  generateRandomTeams,
  normalizeTeamName,
  randomTeamAssignmentSchema,
} from "@/modules/participants/random-teams";
import {
  assertCaseTransition,
  assertSafeReversal,
  planEligibilityPenalty,
} from "@/modules/discipline/workflow";

async function membership(tx: Transaction, actorId: string, organizationId: string) {
  const [member] = await tx
    .select()
    .from(s.organizationMembers)
    .where(
      and(
        eq(s.organizationMembers.organizationId, organizationId),
        eq(s.organizationMembers.userId, actorId),
      ),
    );
  invariant(member, 403, "You do not have access to this organization.");
  return member;
}
async function authorize(
  tx: Transaction,
  actorId: string,
  organizationId: string,
  permission: Permission,
  tournamentId?: string,
) {
  const member = await membership(tx, actorId, organizationId);
  let role = member.role;
  if (tournamentId && !["owner", "organizer"].includes(role)) {
    const [assigned] = await tx
      .select()
      .from(s.tournamentMembers)
      .where(
        and(
          eq(s.tournamentMembers.tournamentId, tournamentId),
          eq(s.tournamentMembers.userId, actorId),
        ),
      );
    role = assigned?.role ?? (permission === "read" ? role : "spectator");
  }
  invariant(hasPermission(role, permission), 403, "Your role does not permit this action.");
  return role;
}
async function audit(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown> = {},
) {
  await tx.insert(s.auditLogs).values({ organizationId, actorId, action, entityId, details });
}
async function lockTournament(
  tx: Transaction,
  organizationId: string,
  tournamentId: string,
  expectedRevision?: number,
) {
  const [tournament] = await tx
    .select()
    .from(s.tournaments)
    .where(
      and(eq(s.tournaments.id, tournamentId), eq(s.tournaments.organizationId, organizationId)),
    )
    .for("update");
  invariant(tournament && !tournament.deletedAt, 404, "Tournament not found.");
  if (expectedRevision !== undefined)
    invariant(
      tournament.revision === expectedRevision,
      409,
      "This tournament changed. Refresh before trying again.",
    );
  return tournament;
}
async function loadStructure(
  tx: Transaction,
  tournament: typeof s.tournaments.$inferSelect,
): Promise<Structure> {
  const entrants = await tx
    .select()
    .from(s.participants)
    .where(eq(s.participants.tournamentId, tournament.id))
    .orderBy(asc(s.participants.seed));
  const rows = await tx
    .select()
    .from(s.matches)
    .where(eq(s.matches.tournamentId, tournament.id))
    .orderBy(asc(s.matches.round), asc(s.matches.position));
  return {
    format: tournament.format as FormatId,
    revision: tournament.revision,
    championId: tournament.championId,
    entrants: entrants.map((p) => ({
      id: p.id,
      name: p.name,
      seed: p.seed,
      eligible: p.eligibility === "eligible",
    })),
    matches: rows.map((m) => ({
      id: m.key,
      round: m.round,
      position: m.position,
      stage: m.stage,
      sources: m.sources,
      participants: [m.participantA, m.participantB],
      status: m.status,
      scores: m.scores ?? undefined,
      winnerId: m.winnerId,
    })),
  };
}
async function persistStructure(
  tx: Transaction,
  tournamentId: string,
  structure: Structure,
  actorId: string,
  reason?: string,
) {
  const existing = await tx
    .select()
    .from(s.matches)
    .where(eq(s.matches.tournamentId, tournamentId));
  for (const match of structure.matches) {
    const row = existing.find((m) => m.key === match.id);
    invariant(row, 500, "Persisted match missing.");
    const changedScore =
      JSON.stringify(row.scores) !== JSON.stringify(match.scores ?? null) ||
      row.winnerId !== (match.winnerId ?? null) ||
      row.status !== match.status;
    const changedSlots =
      row.participantA !== match.participants[0] || row.participantB !== match.participants[1];
    if (!changedScore && !changedSlots) continue;
    await tx
      .update(s.matches)
      .set({
        participantA: match.participants[0],
        participantB: match.participants[1],
        status: match.status,
        scores: match.scores ?? null,
        winnerId: match.winnerId ?? null,
        revision: changedScore ? row.revision + 1 : row.revision,
      })
      .where(eq(s.matches.id, row.id));
    if (changedScore && match.status === "completed" && match.scores)
      await tx.insert(s.matchResults).values({
        matchId: row.id,
        submittedBy: actorId,
        scores: match.scores,
        winnerId: match.winnerId,
        revision: row.revision + 1,
        reason,
      });
  }
  const finished = structure.matches.every((m) => ["completed", "bye"].includes(m.status));
  await tx
    .update(s.tournaments)
    .set({
      revision: structure.revision,
      championId: structure.championId ?? null,
      status: finished ? "completed" : "active",
      updatedAt: new Date(),
    })
    .where(eq(s.tournaments.id, tournamentId));
}
function possibleEntrants(
  match: EngineMatch,
  structure: Structure,
  seen = new Set<string>(),
): string[] {
  if (seen.has(match.id)) throw new AppError(409, "Cyclic match dependencies.");
  const nextSeen = new Set(seen).add(match.id);
  if (match.status === "completed" || match.status === "bye")
    return match.winnerId ? [match.winnerId] : [];
  return [
    ...new Set(
      match.sources.flatMap((source) => {
        if (!source) return [];
        if ("entrantId" in source) return [source.entrantId];
        if ("group" in source)
          return [
            ...new Set(
              structure.matches
                .filter((m) => m.stage === source.group)
                .flatMap((m) => m.participants.filter((id): id is string => id !== null)),
            ),
          ];
        const dependency = structure.matches.find((m) => m.id === source.matchId);
        if (
          dependency &&
          source.outcome === "loser" &&
          ["completed", "bye"].includes(dependency.status)
        )
          return dependency.status === "bye"
            ? []
            : dependency.participants.filter(
                (id): id is string => id !== null && id !== dependency.winnerId,
              );
        return dependency ? possibleEntrants(dependency, structure, nextSeen) : [];
      }),
    ),
  ];
}
function applyIneligibleForfeits(structure: Structure): Structure {
  let next = structure,
    changed = true;
  while (changed) {
    changed = false;
    for (const match of next.matches) {
      if (match.status !== "ready") continue;
      const blocked = match.participants.filter(
        (id) => next.entrants.find((e) => e.id === id)?.eligible === false,
      );
      if (!blocked.length) continue;
      invariant(
        blocked.length === 1,
        409,
        "Both entrants are ineligible. An organizer must resolve this match explicitly.",
      );
      const winner = match.participants.find((id) => id && !blocked.includes(id));
      invariant(winner, 409, "A forfeit winner could not be determined.");
      next = getFormat(next.format).advance(next, {
        matchId: match.id,
        scores: winner === match.participants[0] ? [1, 0] : [0, 1],
        forfeitWinnerId: winner,
      });
      changed = true;
      break;
    }
  }
  return next;
}

export async function executeCommand(
  actorId: string,
  command: Command,
): Promise<Record<string, unknown>> {
  return db.transaction(async (tx) => {
    const organizationId = "organizationId" in command ? command.organizationId : undefined;
    // Serialize mutations in an organization: includes cross-tournament venue bookings and membership revocation.
    if (organizationId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`);
      await membership(tx, actorId, organizationId);
    }
    let fingerprint: string | undefined;
    if ("idempotencyKey" in command && organizationId) {
      fingerprint = createHash("sha256").update(JSON.stringify({ actorId, command })).digest("hex");
      const [receipt] = await tx
        .select()
        .from(s.idempotencyKeys)
        .where(
          and(
            eq(s.idempotencyKeys.organizationId, organizationId),
            eq(s.idempotencyKeys.key, command.idempotencyKey),
          ),
        );
      if (receipt) {
        invariant(
          receipt.actorId === actorId && receipt.fingerprint === fingerprint,
          409,
          "This idempotency key was already used for a different command.",
        );
        return receipt.response;
      }
    }
    const result = await runCommand(tx, actorId, command);
    if ("idempotencyKey" in command && organizationId && fingerprint)
      await tx.insert(s.idempotencyKeys).values({
        organizationId,
        key: command.idempotencyKey,
        actorId,
        fingerprint,
        response: result,
      });
    return result;
  });
}

async function runCommand(
  tx: Transaction,
  actorId: string,
  c: Command,
): Promise<Record<string, unknown>> {
  if (c.action === "organization.create") {
    const [organization] = await tx
      .insert(s.organizations)
      .values({
        name: c.name,
        slug: `${c.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 8)}`,
      })
      .returning();
    await tx
      .insert(s.organizationMembers)
      .values({ organizationId: organization.id, userId: actorId, role: "owner" });
    await audit(tx, organization.id, actorId, c.action, organization.id);
    return { id: organization.id };
  }
  const org = c.organizationId;
  if (c.action === "teams.preview" || c.action === "teams.generate") {
    const role = await authorize(tx, actorId, org, "rosters");
    invariant(
      role !== "manager",
      403,
      "Organizers create teams; managers can edit their assigned roster.",
    );
    const existing = await tx
      .select({ name: s.teams.name })
      .from(s.teams)
      .where(eq(s.teams.organizationId, org));
    if (c.action === "teams.preview")
      return {
        teams: generateRandomTeams(
          c.settings,
          existing.map((team) => team.name),
          randomInt,
        ),
      };
    const assignment = randomTeamAssignmentSchema.parse(c.assignment);
    const taken = new Set(existing.map((team) => normalizeTeamName(team.name)));
    invariant(
      assignment.teams.every((team) => !taken.has(normalizeTeamName(team.name))),
      409,
      "A generated name is now in use. Reshuffle the preview before saving.",
    );
    const teams = assignment.teams.map((team) => ({
      id: randomUUID(),
      organizationId: org,
      name: team.name,
    }));
    const players = assignment.playerNames.map((name) => ({
      id: randomUUID(),
      organizationId: org,
      name,
    }));
    await tx.insert(s.teams).values(teams);
    await tx.insert(s.players).values(players);
    await tx.insert(s.teamRosters).values(
      assignment.teams.flatMap((team, i) =>
        team.players.map((player) => ({
          organizationId: org,
          teamId: teams[i].id,
          playerId: players[player.index].id,
          role: "player",
        })),
      ),
    );
    await audit(tx, org, actorId, c.action, teams[0].id, {
      teamIds: teams.map((team) => team.id),
      playerCount: players.length,
      splitMode: assignment.splitMode,
      splitValue: assignment.splitValue,
    });
    return { teams: teams.map(({ id, name }) => ({ id, name })), playerCount: players.length };
  }
  if (c.action === "organization.member") {
    await authorize(tx, actorId, org, "members");
    const [person] = await tx.select().from(s.user).where(eq(s.user.email, c.email.toLowerCase()));
    invariant(person, 404, "This person must create a Tournivo account before being added.");
    const [existing] = await tx
      .select()
      .from(s.organizationMembers)
      .where(
        and(
          eq(s.organizationMembers.organizationId, org),
          eq(s.organizationMembers.userId, person.id),
        ),
      );
    invariant(existing?.role !== "owner", 409, "Owner role cannot be changed here.");
    await tx
      .insert(s.organizationMembers)
      .values({ organizationId: org, userId: person.id, role: c.role })
      .onConflictDoUpdate({
        target: [s.organizationMembers.organizationId, s.organizationMembers.userId],
        set: { role: c.role },
      });
    await audit(tx, org, actorId, c.action, person.id, { role: c.role });
    return { id: person.id };
  }
  if (c.action === "team.create") {
    const role = await authorize(tx, actorId, org, "rosters");
    invariant(
      role !== "manager",
      403,
      "Managers can edit their assigned team; organizers create teams.",
    );
    const [team] = await tx
      .insert(s.teams)
      .values({ organizationId: org, name: c.name, shortName: c.shortName })
      .returning();
    await audit(tx, org, actorId, c.action, team.id);
    return { id: team.id };
  }
  if (c.action === "team.assign-manager") {
    const role = await authorize(tx, actorId, org, "manage");
    invariant(
      ["owner", "organizer", "admin"].includes(role),
      403,
      "An organizer must assign team managers.",
    );
    await membership(tx, c.userId, org);
    const [team] = await tx
      .update(s.teams)
      .set({ managerId: c.userId })
      .where(and(eq(s.teams.id, c.teamId), eq(s.teams.organizationId, org)))
      .returning();
    invariant(team, 404, "Team not found.");
    await audit(tx, org, actorId, c.action, team.id);
    return { id: team.id };
  }
  if (c.action === "roster.add") {
    const role = await authorize(tx, actorId, org, "rosters");
    const [team] = await tx
      .select()
      .from(s.teams)
      .where(and(eq(s.teams.id, c.teamId), eq(s.teams.organizationId, org)));
    invariant(team, 404, "Team not found.");
    invariant(
      role !== "manager" || team.managerId === actorId,
      403,
      "You can edit only your assigned team.",
    );
    const registrations = await tx
      .select()
      .from(s.participants)
      .where(eq(s.participants.teamId, team.id));
    // Generated competitions lock rosters until a complete change-policy workflow is implemented.
    for (const registration of registrations) {
      const [tournament] = await tx
        .select()
        .from(s.tournaments)
        .where(eq(s.tournaments.id, registration.tournamentId));
      invariant(
        tournament.deletedAt || tournament.status === "draft",
        409,
        "This roster is locked by a generated tournament.",
      );
    }
    const linkedUser = c.email
      ? (await tx.select().from(s.user).where(eq(s.user.email, c.email.toLowerCase())))[0]
      : undefined;
    invariant(!c.email || linkedUser, 422, "Create the player's account before linking an email.");
    if (linkedUser) await membership(tx, linkedUser.id, org);
    const [player] = await tx
      .insert(s.players)
      .values({ organizationId: org, name: c.name, userId: linkedUser?.id })
      .returning();
    await tx
      .insert(s.teamRosters)
      .values({ organizationId: org, teamId: team.id, playerId: player.id, role: c.role });
    await audit(tx, org, actorId, c.action, team.id);
    return { id: player.id };
  }
  if (c.action === "venue.create") {
    await authorize(tx, actorId, org, "manage");
    invariant(
      c.availability.every((w) => Date.parse(w.end) > Date.parse(w.start)),
      422,
      "Availability end must follow start.",
    );
    try {
      new Intl.DateTimeFormat("en", { timeZone: c.timezone });
    } catch {
      throw new AppError(422, "Invalid IANA timezone.");
    }
    const [venue] = await tx
      .insert(s.venues)
      .values({
        organizationId: org,
        name: c.name,
        timezone: c.timezone,
        kind: c.kind,
        availability: c.availability,
      })
      .returning();
    await audit(tx, org, actorId, c.action, venue.id);
    return { id: venue.id };
  }
  if (c.action === "notification.read") {
    await tx
      .update(s.notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(s.notifications.id, c.notificationId),
          eq(s.notifications.userId, actorId),
          eq(s.notifications.organizationId, org),
        ),
      );
    return { ok: true };
  }
  if (c.action === "tournament.save") {
    await authorize(tx, actorId, org, "manage", c.tournamentId);
    const d = c.draft;
    const [sport] = await tx.select().from(s.sports).where(eq(s.sports.id, d.sportId));
    invariant(sport, 422, "Choose an available catalog entry.");
    const values = {
      name: d.name,
      description: d.description,
      sportId: d.sportId,
      format: d.format,
      participantType: d.participantType,
      visibility: d.visibility,
      config: d,
      draft: d,
      updatedAt: new Date(),
    };
    let id: string;
    if (c.tournamentId) {
      const t = await lockTournament(tx, org, c.tournamentId, c.expectedRevision);
      invariant(t.status === "draft", 409, "Generated tournament configuration is locked.");
      await tx
        .update(s.tournaments)
        .set({ ...values, revision: t.revision + 1 })
        .where(eq(s.tournaments.id, t.id));
      id = t.id;
    } else {
      const [t] = await tx
        .insert(s.tournaments)
        .values({
          ...values,
          organizationId: org,
          createdBy: actorId,
          slug: `${d.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 8)}`,
        })
        .returning();
      id = t.id;
    }
    await audit(tx, org, actorId, c.action, id);
    return { id };
  }

  const tournamentId = c.tournamentId;
  const permission: Permission =
    c.action === "match.result"
      ? "results"
      : ["case.transition", "case.decide", "appeal.decide"].includes(c.action)
        ? "discipline"
        : ["case.report", "case.respond", "appeal.submit", "rulebook.acknowledge"].includes(
              c.action,
            )
          ? "read"
          : "manage";
  const role = await authorize(tx, actorId, org, permission, tournamentId);
  const t = await lockTournament(
    tx,
    org,
    tournamentId,
    "expectedRevision" in c ? c.expectedRevision : undefined,
  );

  if (c.action === "tournament.delete") {
    invariant(
      c.confirmationName === t.name,
      422,
      "Type the tournament name exactly to confirm deletion.",
    );
    const now = new Date();
    // Preserve immutable sporting/disciplinary history; normal reads and writes exclude deleted tournaments.
    await tx
      .update(s.tournaments)
      .set({ deletedAt: now, visibility: "private", revision: t.revision + 1, updatedAt: now })
      .where(eq(s.tournaments.id, t.id));
    await audit(tx, org, actorId, c.action, t.id, { name: t.name, status: t.status });
    return { id: t.id };
  }

  if (c.action === "tournament.assign") {
    await membership(tx, c.userId, org);
    await tx
      .insert(s.tournamentMembers)
      .values({ tournamentId, userId: c.userId, role: c.role })
      .onConflictDoUpdate({
        target: [s.tournamentMembers.tournamentId, s.tournamentMembers.userId],
        set: { role: c.role },
      });
    await audit(tx, org, actorId, c.action, tournamentId, { userId: c.userId, role: c.role });
    return { id: tournamentId };
  }
  if (c.action === "match.assign") {
    await membership(tx, c.userId, org);
    const [assignment] = await tx
      .select()
      .from(s.tournamentMembers)
      .where(
        and(
          eq(s.tournamentMembers.tournamentId, tournamentId),
          eq(s.tournamentMembers.userId, c.userId),
        ),
      );
    invariant(
      assignment?.role === "referee",
      422,
      "Assign this member as a tournament referee first.",
    );
    const [match] = await tx
      .update(s.matches)
      .set({ refereeId: c.userId })
      .where(and(eq(s.matches.id, c.matchId), eq(s.matches.tournamentId, tournamentId)))
      .returning();
    invariant(match, 404, "Match not found.");
    await audit(tx, org, actorId, c.action, match.id);
    return { id: match.id };
  }
  if (c.action === "participant.withdraw") {
    invariant(
      t.status !== "draft",
      409,
      "Generate this tournament before changing registration eligibility.",
    );
    const [participant] = await tx
      .select()
      .from(s.participants)
      .where(
        and(eq(s.participants.id, c.participantId), eq(s.participants.tournamentId, tournamentId)),
      );
    invariant(
      participant && participant.eligibility === "eligible",
      409,
      "Only an eligible registration can withdraw.",
    );
    let structure = await loadStructure(tx, t);
    structure.entrants = structure.entrants.map((e) =>
      e.id === participant.id ? { ...e, eligible: false } : e,
    );
    structure = applyIneligibleForfeits(structure);
    structure.revision = Math.max(structure.revision, t.revision + 1);
    await tx
      .update(s.participants)
      .set({ eligibility: "withdrawn" })
      .where(eq(s.participants.id, participant.id));
    await persistStructure(tx, tournamentId, structure, actorId, c.reason);
    await audit(tx, org, actorId, c.action, participant.id, {
      reason: c.reason,
      policy: c.policy,
      forfeitScore: "1-0",
    });
    return { id: participant.id };
  }
  if (c.action === "participant.link-user") {
    const [participant] = await tx
      .select()
      .from(s.participants)
      .where(
        and(eq(s.participants.id, c.participantId), eq(s.participants.tournamentId, tournamentId)),
      );
    invariant(
      participant?.playerId,
      422,
      "Only individual registrations link directly to an account.",
    );
    const [person] = await tx.select().from(s.user).where(eq(s.user.email, c.email.toLowerCase()));
    invariant(person, 404, "This account does not exist yet.");
    await membership(tx, person.id, org);
    await tx
      .update(s.players)
      .set({ userId: person.id })
      .where(eq(s.players.id, participant.playerId));
    await audit(tx, org, actorId, c.action, participant.id, { userId: person.id });
    return { id: participant.id };
  }

  if (c.action === "tournament.generate") {
    invariant(t.status === "draft", 409, "This tournament has already been generated.");
    const d = tournamentDraftSchema.parse(t.draft);
    invariant(
      d.registration === "manual",
      422,
      "Public registration is not implemented yet. Choose manual registration.",
    );
    const entrants: { id: string; name: string; seed: number }[] = [];
    for (const [i, name] of d.entrantNames.entries()) {
      let entity: { teamId: string } | { playerId: string };
      if (d.participantType === "individual") {
        const [player] = await tx
          .insert(s.players)
          .values({ organizationId: org, name })
          .returning();
        entity = { playerId: player.id };
      } else {
        const [team] = await tx
          .insert(s.teams)
          .values({ organizationId: org, name })
          .onConflictDoUpdate({ target: [s.teams.organizationId, s.teams.name], set: { name } })
          .returning();
        const roster = await tx
          .select()
          .from(s.teamRosters)
          .where(and(eq(s.teamRosters.teamId, team.id), eq(s.teamRosters.active, true)));
        const activePlayers = roster.filter((p) => !["coach", "manager"].includes(p.role));
        if (d.roster.minimum !== undefined)
          invariant(
            activePlayers.length >= d.roster.minimum,
            422,
            `${name} is below your configured minimum roster size. Add players first.`,
          );
        if (d.roster.maximum !== undefined)
          invariant(
            activePlayers.length <= d.roster.maximum,
            422,
            `${name} exceeds your configured maximum roster size.`,
          );
        if (d.roster.activeLineup !== undefined)
          invariant(
            activePlayers.length >= d.roster.activeLineup,
            422,
            `${name} has fewer players than the configured active lineup.`,
          );
        if (d.roster.substitutes !== undefined)
          invariant(
            roster.filter((r) => r.role === "substitute").length <= d.roster.substitutes,
            422,
            `${name} exceeds your configured substitute limit.`,
          );
        entity = { teamId: team.id };
      }
      const [p] = await tx
        .insert(s.participants)
        .values({ organizationId: org, tournamentId, name, seed: i + 1, ...entity })
        .returning();
      entrants.push({ id: p.id, name, seed: i + 1 });
    }
    if (d.roster.equalSizes && d.participantType !== "individual") {
      const registrations = await tx
        .select()
        .from(s.participants)
        .where(eq(s.participants.tournamentId, tournamentId));
      const counts: number[] = [];
      for (const p of registrations)
        counts.push(
          (
            await tx
              .select()
              .from(s.teamRosters)
              .where(and(eq(s.teamRosters.teamId, p.teamId!), eq(s.teamRosters.active, true)))
          ).filter((r) => !["coach", "manager"].includes(r.role)).length,
        );
      invariant(new Set(counts).size <= 1, 422, "Your policy requires equal roster sizes.");
    }
    const structure = getFormat(d.format).generate(entrants);
    await tx.insert(s.stages).values(
      [...new Set(structure.matches.map((m) => m.stage))].map((stage, position) => ({
        tournamentId,
        name: stage,
        format: stage.startsWith("group-")
          ? "round-robin"
          : stage === "knockout"
            ? "single-elimination"
            : d.format,
        position,
      })),
    );
    await tx.insert(s.matches).values(
      structure.matches.map((m) => ({
        organizationId: org,
        tournamentId,
        key: m.id,
        round: m.round,
        position: m.position,
        stage: m.stage,
        sources: m.sources,
        participantA: m.participants[0],
        participantB: m.participants[1],
        status: m.status,
        winnerId: m.winnerId,
      })),
    );
    await tx
      .update(s.tournaments)
      .set({ status: "active", revision: t.revision + 1, updatedAt: new Date() })
      .where(eq(s.tournaments.id, tournamentId));
    await audit(tx, org, actorId, c.action, tournamentId, {
      matches: structure.matches.filter((m) => m.status !== "bye").length,
    });
    return { id: tournamentId };
  }
  if (c.action === "tournament.publish") {
    invariant(t.status !== "draft", 409, "Generate the tournament before publishing.");
    await tx
      .update(s.tournaments)
      .set({ visibility: c.visibility, revision: t.revision + 1 })
      .where(eq(s.tournaments.id, tournamentId));
    await audit(tx, org, actorId, c.action, tournamentId, { visibility: c.visibility });
    return { id: tournamentId, slug: t.slug };
  }
  if (c.action === "match.result" || c.action === "match.correct") {
    invariant(t.status !== "draft", 409, "Generate matches first.");
    const [row] = await tx
      .select()
      .from(s.matches)
      .where(and(eq(s.matches.id, c.matchId), eq(s.matches.tournamentId, tournamentId)));
    invariant(row, 404, "Match not found.");
    if (role === "referee")
      invariant(
        row.refereeId === actorId,
        403,
        "You may submit results only for your assigned matches.",
      );
    let structure = await loadStructure(tx, t);
    if (c.action === "match.correct") {
      invariant(row.status === "completed", 409, "Only completed results can be corrected.");
      const affected = new Set([row.key]);
      for (const m of structure.matches)
        if (
          m.sources.some(
            (source) =>
              source &&
              (("matchId" in source && affected.has(source.matchId)) ||
                ("group" in source && source.group === row.stage)),
          )
        )
          affected.add(m.id);
      invariant(
        !structure.matches.some(
          (m) => m.id !== row.key && affected.has(m.id) && m.status === "completed",
        ),
        409,
        "A downstream result depends on this match. Organizer resolution is required.",
      );
      for (const m of structure.matches)
        if (affected.has(m.id)) {
          m.status = "pending";
          m.scores = undefined;
          m.winnerId = undefined;
          if (m.id !== row.key) m.participants = [null, null];
        }
      const corrected = structure.matches.find((m) => m.id === row.key)!;
      corrected.status = "ready";
    }
    structure = getFormat(t.format).advance(structure, {
      matchId: row.key,
      scores: c.scores,
      forfeitWinnerId: c.action === "match.result" ? c.forfeitWinnerId : undefined,
    });
    structure = applyIneligibleForfeits(structure);
    await persistStructure(
      tx,
      tournamentId,
      structure,
      actorId,
      c.action === "match.correct" ? c.reason : undefined,
    );
    await audit(tx, org, actorId, c.action, row.id, {
      scores: c.scores,
      ...(c.action === "match.correct" ? { reason: c.reason } : {}),
    });
    return { id: row.id, revision: structure.revision };
  }
  if (c.action === "schedule.generate") {
    invariant(t.status !== "draft", 409, "Generate matches before scheduling.");
    const config = tournamentDraftSchema.parse(t.config);
    const resources = await tx
      .select()
      .from(s.venues)
      .where(and(eq(s.venues.organizationId, org), inArray(s.venues.id, c.venueIds)));
    invariant(resources.length === c.venueIds.length, 422, "Some selected venues are unavailable.");
    const structure = await loadStructure(tx, t);
    invariant(
      !structure.matches.some((m) => m.status === "completed"),
      409,
      "Automatic rescheduling is locked after results begin. Historical match times must be preserved.",
    );
    const schedulable: Schedulable[] = structure.matches
      .filter((m) => m.status !== "bye")
      .map((m) => ({
        id: m.id,
        participants: possibleEntrants(m, structure),
        dependencies: [
          ...new Set(
            m.sources.flatMap((source) =>
              source && "group" in source
                ? structure.matches
                    .filter((dep) => dep.stage.startsWith("group-"))
                    .map((dep) => dep.id)
                : source &&
                    "matchId" in source &&
                    structure.matches.find((dep) => dep.id === source.matchId)?.status !== "bye"
                  ? [source.matchId]
                  : [],
            ),
          ),
        ],
        durationMinutes: config.durationMinutes,
      }));
    const otherBookings = await tx
      .select()
      .from(s.schedules)
      .where(
        and(
          eq(s.schedules.organizationId, org),
          inArray(s.schedules.venueId, c.venueIds),
          inArray(
            s.schedules.tournamentId,
            tx
              .select({ id: s.tournaments.id })
              .from(s.tournaments)
              .where(isNull(s.tournaments.deletedAt)),
          ),
        ),
      );
    // Block occupied venue windows from every other tournament before allocation.
    const available = resources.map((r) => {
      let windows = [...r.availability];
      for (const b of otherBookings.filter(
        (b) => b.tournamentId !== tournamentId && b.venueId === r.id,
      ))
        windows = windows.flatMap((w) => {
          const start = Date.parse(w.start),
            end = Date.parse(w.end),
            bs = b.startsAt.getTime(),
            be = b.endsAt.getTime();
          if (be <= start || bs >= end) return [w];
          return [
            ...(bs > start ? [{ start: w.start, end: b.startsAt.toISOString() }] : []),
            ...(be < end ? [{ start: b.endsAt.toISOString(), end: w.end }] : []),
          ];
        });
      if (config.startsAt || config.endsAt)
        windows = windows
          .map((w) => ({
            start: new Date(
              Math.max(
                Date.parse(w.start),
                config.startsAt ? Date.parse(config.startsAt) : -Infinity,
              ),
            ).toISOString(),
            end: new Date(
              Math.min(Date.parse(w.end), config.endsAt ? Date.parse(config.endsAt) : Infinity),
            ).toISOString(),
          }))
          .filter((w) => Date.parse(w.end) > Date.parse(w.start));
      return { id: r.id, availability: windows };
    });
    let bookings: ReturnType<typeof generateSchedule>;
    try {
      bookings = generateSchedule(schedulable, available, {
        restMinutes: config.restMinutes,
        maxConcurrent: c.maxConcurrent,
      });
    } catch (error) {
      throw new AppError(
        422,
        error instanceof Error ? error.message : "No valid schedule could be generated.",
      );
    }
    const rows = await tx.select().from(s.matches).where(eq(s.matches.tournamentId, tournamentId));
    await tx.delete(s.schedules).where(eq(s.schedules.tournamentId, tournamentId));
    if (bookings.length)
      await tx.insert(s.schedules).values(
        bookings.map((b) => ({
          organizationId: org,
          tournamentId,
          matchId: rows.find((m) => m.key === b.matchId)!.id,
          venueId: b.venueId,
          startsAt: new Date(b.start),
          endsAt: new Date(b.end),
          revision: t.revision + 1,
        })),
      );
    await tx
      .update(s.tournaments)
      .set({ revision: t.revision + 1 })
      .where(eq(s.tournaments.id, tournamentId));
    await audit(tx, org, actorId, c.action, tournamentId, { matches: bookings.length });
    return { id: tournamentId, count: bookings.length };
  }
  if (c.action === "rulebook.publish") {
    invariant(
      Date.parse(c.publication.effectiveAt) >= Date.now() - 60000,
      422,
      "New rulebook versions cannot take effect retroactively.",
    );
    let [book] = await tx
      .select()
      .from(s.rulebooks)
      .where(eq(s.rulebooks.tournamentId, tournamentId));
    if (!book)
      [book] = await tx
        .insert(s.rulebooks)
        .values({ organizationId: org, tournamentId, title: c.publication.title })
        .returning();
    const previous = await tx
      .select()
      .from(s.rulebookVersions)
      .where(eq(s.rulebookVersions.rulebookId, book.id))
      .orderBy(desc(s.rulebookVersions.version));
    const [version] = await tx
      .insert(s.rulebookVersions)
      .values({
        rulebookId: book.id,
        version: (previous[0]?.version ?? 0) + 1,
        effectiveAt: new Date(c.publication.effectiveAt),
        publishedBy: actorId,
        requireRenewal: c.publication.requireRenewal,
      })
      .returning();
    await tx
      .insert(s.customRules)
      .values(c.publication.rules.map((rule) => ({ ...rule, versionId: version.id })));
    await tx
      .update(s.tournaments)
      .set({ revision: t.revision + 1 })
      .where(eq(s.tournaments.id, tournamentId));
    await audit(tx, org, actorId, c.action, version.id, { version: version.version });
    return { id: version.id, version: version.version };
  }
  if (c.action === "rulebook.acknowledge") {
    const [version] = await tx
      .select({ id: s.rulebookVersions.id })
      .from(s.rulebookVersions)
      .innerJoin(s.rulebooks, eq(s.rulebooks.id, s.rulebookVersions.rulebookId))
      .where(
        and(eq(s.rulebooks.tournamentId, tournamentId), eq(s.rulebookVersions.id, c.versionId)),
      );
    invariant(version, 404, "Rulebook version not found.");
    await tx
      .insert(s.acknowledgements)
      .values({ versionId: version.id, userId: actorId })
      .onConflictDoNothing();
    await audit(tx, org, actorId, c.action, version.id);
    return { id: version.id };
  }
  if (c.action === "case.report") {
    invariant(
      ["owner", "organizer", "admin", "referee", "manager"].includes(role),
      403,
      "Player-submitted reports are not enabled for this tournament.",
    );
    const [participant] = await tx
      .select()
      .from(s.participants)
      .where(
        and(eq(s.participants.id, c.participantId), eq(s.participants.tournamentId, tournamentId)),
      );
    const [rule] = await tx
      .select({ id: s.customRules.id, effectiveAt: s.rulebookVersions.effectiveAt })
      .from(s.customRules)
      .innerJoin(s.rulebookVersions, eq(s.rulebookVersions.id, s.customRules.versionId))
      .innerJoin(s.rulebooks, eq(s.rulebooks.id, s.rulebookVersions.rulebookId))
      .where(and(eq(s.customRules.id, c.ruleId), eq(s.rulebooks.tournamentId, tournamentId)));
    invariant(participant && rule, 422, "The rule and participant must belong to this tournament.");
    invariant(rule.effectiveAt <= new Date(), 422, "This rule is not effective yet.");
    const [report] = await tx
      .insert(s.disciplinaryCases)
      .values({
        organizationId: org,
        tournamentId,
        participantId: c.participantId,
        ruleId: c.ruleId,
        reportedBy: actorId,
        title: c.title,
        description: c.description,
      })
      .returning();
    const affectedUser = participant.playerId
      ? (await tx.select().from(s.players).where(eq(s.players.id, participant.playerId)))[0]?.userId
      : participant.teamId
        ? (await tx.select().from(s.teams).where(eq(s.teams.id, participant.teamId)))[0]?.managerId
        : null;
    if (affectedUser)
      await tx.insert(s.notifications).values({
        organizationId: org,
        userId: affectedUser,
        title: "A disciplinary case was reported",
        message: `${c.title}. Contact the tournament organizer to respond.`,
      });
    await audit(tx, org, actorId, c.action, report.id);
    return { id: report.id };
  }
  if (c.action === "case.transition") {
    const [report] = await tx
      .select()
      .from(s.disciplinaryCases)
      .where(
        and(
          eq(s.disciplinaryCases.id, c.caseId),
          eq(s.disciplinaryCases.tournamentId, tournamentId),
        ),
      );
    invariant(report, 404, "Case not found.");
    assertCaseTransition(report.status, c.status);
    await tx
      .update(s.disciplinaryCases)
      .set({ status: c.status, reviewerId: actorId, revision: report.revision + 1 })
      .where(eq(s.disciplinaryCases.id, report.id));
    await tx
      .update(s.tournaments)
      .set({ revision: t.revision + 1 })
      .where(eq(s.tournaments.id, tournamentId));
    await audit(tx, org, actorId, c.action, report.id, { from: report.status, to: c.status });
    return { id: report.id };
  }
  if (c.action === "case.respond") {
    const [report] = await tx
      .select()
      .from(s.disciplinaryCases)
      .where(
        and(
          eq(s.disciplinaryCases.id, c.caseId),
          eq(s.disciplinaryCases.tournamentId, tournamentId),
        ),
      );
    invariant(report, 404, "Case not found.");
    const [p] = await tx
      .select()
      .from(s.participants)
      .where(eq(s.participants.id, report.participantId));
    const affected = p.teamId
      ? (await tx.select().from(s.teams).where(eq(s.teams.id, p.teamId)))[0]?.managerId
      : p.playerId
        ? (await tx.select().from(s.players).where(eq(s.players.id, p.playerId)))[0]?.userId
        : null;
    invariant(
      affected === actorId,
      403,
      "Only the affected participant or team manager may submit this response.",
    );
    invariant(
      ["awaiting_response", "evidence_requested"].includes(report.status),
      409,
      "This case is not awaiting a response.",
    );
    await tx
      .update(s.disciplinaryCases)
      .set({ response: c.response, status: "under_review", revision: report.revision + 1 })
      .where(eq(s.disciplinaryCases.id, report.id));
    await audit(tx, org, actorId, c.action, report.id);
    return { id: report.id };
  }
  if (c.action === "case.decide") {
    const [report] = await tx
      .select()
      .from(s.disciplinaryCases)
      .where(
        and(
          eq(s.disciplinaryCases.id, c.caseId),
          eq(s.disciplinaryCases.tournamentId, tournamentId),
        ),
      );
    invariant(report, 404, "Case not found.");
    assertCaseTransition(report.status, "confirmed");
    const [participant] = await tx
      .select()
      .from(s.participants)
      .where(eq(s.participants.id, report.participantId));
    const [rule] = await tx.select().from(s.customRules).where(eq(s.customRules.id, report.ruleId));
    invariant(
      rule.penalty === c.penalty || rule.escalation.includes(c.penalty),
      422,
      "The selected penalty is not in this rule's published policy.",
    );
    if (c.appealDeadline)
      invariant(
        Date.parse(c.appealDeadline) > Date.now(),
        422,
        "Appeal deadline must be in the future.",
      );
    const before = await loadStructure(tx, t);
    const plan = planEligibilityPenalty(
      c.penalty,
      c.policy,
      before.matches.some((m) => m.status !== "completed" && m.status !== "bye"),
    );
    invariant(
      !(c.penalty.startsWith("player-") && participant.teamId),
      422,
      "Player penalties in team competitions require a player-specific case; do not disqualify the whole team.",
    );
    invariant(
      !(c.penalty.startsWith("team-") && participant.playerId),
      422,
      "Team penalties cannot target an individual registration.",
    );
    let after = structuredClone(before);
    if (plan.eligibility) {
      invariant(
        participant.eligibility === "eligible",
        409,
        "This participant already has an active eligibility restriction.",
      );
      await tx
        .update(s.participants)
        .set({ eligibility: plan.eligibility })
        .where(eq(s.participants.id, participant.id));
      after.entrants = after.entrants.map((e) =>
        e.id === participant.id ? { ...e, eligible: false } : e,
      );
      if (plan.applyForfeits) after = applyIneligibleForfeits(after);
    }
    after.revision = Math.max(after.revision, t.revision + 1);
    const [decision] = await tx
      .insert(s.decisions)
      .values({
        caseId: report.id,
        decidedBy: actorId,
        explanation: c.explanation,
        penalty: c.penalty,
        policy: c.policy,
        appealDeadline: rule.appealEligible && c.appealDeadline ? new Date(c.appealDeadline) : null,
        appliedRevision: after.revision,
        snapshot: before,
      })
      .returning();
    await tx.insert(s.penalties).values({
      decisionId: decision.id,
      participantId: participant.id,
      kind: c.penalty,
      previousEligibility: participant.eligibility,
    });
    await tx
      .update(s.disciplinaryCases)
      .set({ status: "confirmed", reviewerId: actorId, revision: report.revision + 1 })
      .where(eq(s.disciplinaryCases.id, report.id));
    await persistStructure(
      tx,
      tournamentId,
      after,
      actorId,
      `Disciplinary decision ${decision.id}`,
    );
    await audit(tx, org, actorId, c.action, decision.id, { penalty: c.penalty, policy: c.policy });
    return { id: decision.id };
  }
  if (c.action === "appeal.submit") {
    const [decision] = await tx
      .select({ decision: s.decisions, report: s.disciplinaryCases })
      .from(s.decisions)
      .innerJoin(s.disciplinaryCases, eq(s.disciplinaryCases.id, s.decisions.caseId))
      .where(
        and(eq(s.decisions.id, c.decisionId), eq(s.disciplinaryCases.tournamentId, tournamentId)),
      );
    invariant(decision, 404, "Decision not found.");
    invariant(
      decision.decision.appealDeadline && decision.decision.appealDeadline > new Date(),
      422,
      "The appeal deadline is closed or appeals are not permitted.",
    );
    const [participant] = await tx
      .select()
      .from(s.participants)
      .where(eq(s.participants.id, decision.report.participantId));
    const manager = participant.teamId
      ? (await tx.select().from(s.teams).where(eq(s.teams.id, participant.teamId)))[0]?.managerId
      : undefined;
    const player = participant.playerId
      ? (await tx.select().from(s.players).where(eq(s.players.id, participant.playerId)))[0]?.userId
      : undefined;
    invariant(
      ["owner", "organizer", "admin"].includes(role) || manager === actorId || player === actorId,
      403,
      "Only the affected participant, manager or an organizer may appeal.",
    );
    assertCaseTransition(decision.report.status, "appealed");
    const [appeal] = await tx
      .insert(s.appeals)
      .values({
        decisionId: c.decisionId,
        submittedBy: actorId,
        reason: c.reason,
        baselineRevision: decision.decision.appliedRevision,
      })
      .returning();
    await tx
      .update(s.disciplinaryCases)
      .set({ status: "appealed" })
      .where(eq(s.disciplinaryCases.id, decision.report.id));
    await audit(tx, org, actorId, c.action, appeal.id);
    return { id: appeal.id };
  }
  if (c.action === "appeal.decide") {
    const [record] = await tx
      .select({ appeal: s.appeals, decision: s.decisions, report: s.disciplinaryCases })
      .from(s.appeals)
      .innerJoin(s.decisions, eq(s.decisions.id, s.appeals.decisionId))
      .innerJoin(s.disciplinaryCases, eq(s.disciplinaryCases.id, s.decisions.caseId))
      .where(and(eq(s.appeals.id, c.appealId), eq(s.disciplinaryCases.tournamentId, tournamentId)));
    invariant(record, 404, "Appeal not found.");
    invariant(record.appeal.status === "submitted", 409, "Appeal already decided.");
    invariant(
      record.decision.decidedBy !== actorId,
      403,
      "An independent reviewer must decide the appeal.",
    );
    if (c.approved) {
      assertSafeReversal(
        record.decision.decidedBy,
        actorId,
        record.appeal.baselineRevision,
        t.revision,
      );
      const [penalty] = await tx
        .select()
        .from(s.penalties)
        .where(eq(s.penalties.decisionId, record.decision.id));
      invariant(penalty && !penalty.reversedAt, 409, "Penalty already reversed.");
      await tx
        .update(s.participants)
        .set({ eligibility: penalty.previousEligibility })
        .where(eq(s.participants.id, penalty.participantId));
      const restored = structuredClone(record.decision.snapshot);
      restored.revision = t.revision + 1;
      await persistStructure(
        tx,
        tournamentId,
        restored,
        actorId,
        `Appeal reversal ${record.appeal.id}`,
      );
      await tx
        .update(s.penalties)
        .set({ reversedAt: new Date() })
        .where(eq(s.penalties.id, penalty.id));
    } else
      await tx
        .update(s.tournaments)
        .set({ revision: t.revision + 1 })
        .where(eq(s.tournaments.id, tournamentId));
    await tx
      .update(s.appeals)
      .set({
        status: c.approved ? "approved" : "rejected",
        reviewerId: actorId,
        explanation: c.explanation,
        decidedAt: new Date(),
      })
      .where(eq(s.appeals.id, record.appeal.id));
    await tx
      .update(s.disciplinaryCases)
      .set({ status: c.approved ? "appeal_approved" : "appeal_rejected" })
      .where(eq(s.disciplinaryCases.id, record.report.id));
    await audit(tx, org, actorId, c.action, record.appeal.id, { approved: c.approved });
    return { id: record.appeal.id };
  }
  throw new AppError(422, "Unsupported command.");
}
