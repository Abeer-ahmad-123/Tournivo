import "dotenv/config";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { commandSchema, tournamentDraftSchema } from "@/lib/contracts";
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
  throw new Error(
    "Set TEST_DATABASE_URL to an isolated database ending in _test. Integration tests never use the application database.",
  );
process.env.DATABASE_URL = testUrl;
const { db, sqlClient } = await import("@/db");
const s = await import("@/db/schema");
const { executeCommand } = await import("@/lib/services");
const { getPublicTournament, getWorkspace, getTournamentDetail } = await import("@/lib/queries");
const { catalogSeed } = await import("@/db/catalog");
const owner = randomUUID(),
  reviewer = randomUUID(),
  outsider = randomUUID(),
  token = randomUUID().slice(0, 8);
let org = "",
  otherOrg = "";
async function execute(actor: string, data: unknown) {
  return executeCommand(actor, commandSchema.parse(data));
}
async function tournament(id: string) {
  return (await db.select().from(s.tournaments).where(eq(s.tournaments.id, id)))[0];
}
async function create(format = "single-elimination", type = "team", count = 8) {
  const draft = tournamentDraftSchema.parse({
    name: `Cup ${randomUUID()}`,
    sportId: "valorant",
    format,
    participantType: type,
    entrantNames: Array.from(
      { length: count },
      (_, i) => `${token}-${randomUUID().slice(0, 5)} entrant ${i + 1}`,
    ),
    roster: { equalSizes: false },
  });
  const saved = await execute(owner, {
    action: "tournament.save",
    organizationId: org,
    expectedRevision: 0,
    draft,
  });
  const id = String(saved.id);
  await execute(owner, {
    action: "tournament.generate",
    organizationId: org,
    tournamentId: id,
    expectedRevision: 0,
    idempotencyKey: randomUUID(),
  });
  return id;
}
async function scoped(id: string) {
  return {
    organizationId: org,
    tournamentId: id,
    expectedRevision: (await tournament(id)).revision,
  };
}
async function rulebook(id: string, penalty = "team-disqualification") {
  return execute(owner, {
    action: "rulebook.publish",
    ...(await scoped(id)),
    publication: {
      title: "Fair competition",
      effectiveAt: new Date().toISOString(),
      requireRenewal: true,
      rules: [
        {
          key: "R-001",
          title: "Eligibility policy",
          description: "Only registered eligible entrants may participate.",
          category: "Eligibility",
          entity: "any-participant",
          severity: "high",
          conditions: "Unauthorized participation verified by reviewer.",
          penalty,
          evidence: "Signed referee report",
          escalation: [],
          appealEligible: true,
        },
      ],
    },
  });
}
async function reportCase(id: string, penalty = "team-disqualification") {
  const published = await rulebook(id, penalty);
  const [rule] = await db
    .select()
    .from(s.customRules)
    .where(eq(s.customRules.versionId, String(published.id)));
  const [p] = await db.select().from(s.participants).where(eq(s.participants.tournamentId, id));
  const report = await execute(owner, {
    action: "case.report",
    ...(await scoped(id)),
    participantId: p.id,
    ruleId: rule.id,
    title: "Eligibility report",
    description: "The submitted registration does not match the entrant.",
  });
  for (const status of ["under_review", "decision_pending"])
    await execute(owner, {
      action: "case.transition",
      ...(await scoped(id)),
      caseId: report.id,
      status,
    });
  return { caseId: String(report.id), participant: p };
}
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(s.sports).values(catalogSeed).onConflictDoNothing();
  await db.insert(s.user).values(
    [owner, reviewer, outsider].map((id, i) => ({
      id,
      name: `Integration user ${i}`,
      email: `${id}@test.invalid`,
    })),
  );
  org = String(
    (await execute(owner, { action: "organization.create", name: `Integration ${token}` })).id,
  );
  otherOrg = String(
    (await execute(outsider, { action: "organization.create", name: `Other ${token}` })).id,
  );
  await db
    .insert(s.organizationMembers)
    .values({ organizationId: org, userId: reviewer, role: "organizer" });
});
afterAll(async () => {
  await sqlClient.end();
});
describe("real PostgreSQL competition lifecycle", () => {
  it("requires management access, the current revision and exact name before deleting a draft once", async () => {
    const saved = await execute(owner, {
      action: "tournament.save",
      organizationId: org,
      expectedRevision: 0,
      draft: tournamentDraftSchema.parse({
        name: `Delete draft ${randomUUID()}`,
        sportId: "foosball",
        entrantNames: ["Red", "Blue"],
        roster: {},
      }),
    });
    const id = String(saved.id),
      t = await tournament(id);
    const command = {
      action: "tournament.delete",
      ...(await scoped(id)),
      confirmationName: t.name,
      idempotencyKey: randomUUID(),
    };
    await expect(execute(outsider, command)).rejects.toThrow(/access/);
    await expect(execute(outsider, { ...command, organizationId: otherOrg })).rejects.toThrow(
      /not found/,
    );
    await expect(
      execute(owner, { ...command, confirmationName: "Wrong tournament" }),
    ).rejects.toThrow(/exactly/);
    await expect(execute(owner, { ...command, expectedRevision: 99 })).rejects.toThrow(/changed/);
    expect((await tournament(id)).deletedAt).toBeNull();
    const admin = randomUUID();
    await db
      .insert(s.user)
      .values({ id: admin, email: `${admin}@test.invalid`, name: "Assigned manager" });
    await db
      .insert(s.organizationMembers)
      .values({ organizationId: org, userId: admin, role: "referee" });
    await execute(owner, {
      action: "tournament.assign",
      ...(await scoped(id)),
      userId: admin,
      role: "referee",
    });
    await expect(execute(admin, command)).rejects.toThrow(/role/);
    await execute(owner, {
      action: "tournament.assign",
      ...(await scoped(id)),
      userId: admin,
      role: "admin",
    });
    const deleted = await execute(admin, command);
    expect(await execute(admin, command)).toEqual(deleted);
    expect((await tournament(id)).deletedAt).toBeInstanceOf(Date);
    await expect(execute(admin, { ...command, idempotencyKey: randomUUID() })).rejects.toThrow(
      /not found/,
    );
    expect(
      await db
        .select()
        .from(s.auditLogs)
        .where(and(eq(s.auditLogs.entityId, id), eq(s.auditLogs.action, "tournament.delete"))),
    ).toHaveLength(1);
    await expect(getTournamentDetail(owner, id)).rejects.toThrow(/not found/);
    await expect(
      execute(owner, {
        action: "tournament.generate",
        ...(await scoped(id)),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/not found/);
  });
  it("deletes completed public tournaments while preserving shared people, teams and immutable history", async () => {
    const id = await create("single-elimination", "team", 2);
    const [match] = await db.select().from(s.matches).where(eq(s.matches.tournamentId, id));
    await execute(owner, {
      action: "match.result",
      ...(await scoped(id)),
      matchId: match.id,
      scores: [2, 0],
      idempotencyKey: randomUUID(),
    });
    expect((await tournament(id)).status).toBe("completed");
    const report = await reportCase(id, "warning");
    const decision = await execute(owner, {
      action: "case.decide",
      ...(await scoped(id)),
      caseId: report.caseId,
      penalty: "warning",
      policy: "preserve-results-forfeit-future",
      explanation: "Confirmed violation; preserve sporting results.",
      idempotencyKey: randomUUID(),
    });
    const details = await getTournamentDetail(owner, id);
    await execute(owner, {
      action: "rulebook.acknowledge",
      ...(await scoped(id)),
      versionId: details.versions[0].id,
    });
    await execute(owner, {
      action: "tournament.publish",
      ...(await scoped(id)),
      visibility: "public",
    });
    const t = await tournament(id);
    expect(await getPublicTournament(t.slug)).not.toBeNull();
    const before = await getWorkspace(owner, org);
    const { authorizeEvidence } = await import("@/lib/evidence");
    await expect(authorizeEvidence(owner, report.caseId)).resolves.toHaveProperty(
      "id",
      report.caseId,
    );
    await execute(owner, {
      action: "tournament.delete",
      ...(await scoped(id)),
      confirmationName: t.name,
      idempotencyKey: randomUUID(),
    });
    const after = await getWorkspace(owner, org);
    expect(after.tournaments.map((row) => row.id)).toEqual(
      before.tournaments.filter((row) => row.id !== id).map((row) => row.id),
    );
    for (const rows of [
      after.matches,
      after.schedules,
      after.participants,
      after.cases,
      after.assignments,
    ])
      expect(rows.some((row) => row.tournamentId === id)).toBe(false);
    expect(after.teams).toEqual(before.teams);
    expect(after.players).toEqual(before.players);
    expect(after.rosters).toEqual(before.rosters);
    expect(await getPublicTournament(t.slug)).toBeNull();
    await expect(getTournamentDetail(owner, id)).rejects.toThrow(/not found/);
    await expect(authorizeEvidence(owner, report.caseId)).rejects.toThrow(/not found/);
    await expect(
      execute(owner, { action: "tournament.publish", ...(await scoped(id)), visibility: "public" }),
    ).rejects.toThrow(/not found/);
    await expect(
      execute(owner, {
        action: "match.correct",
        ...(await scoped(id)),
        matchId: match.id,
        scores: [0, 2],
        reason: "Must not edit a deleted tournament.",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/not found/);
    expect(
      await db.select().from(s.matchResults).where(eq(s.matchResults.matchId, match.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(s.decisions)
        .where(eq(s.decisions.id, String(decision.id))),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(s.acknowledgements)
        .where(eq(s.acknowledgements.versionId, details.versions[0].id)),
    ).toHaveLength(1);
    await expect(
      db
        .update(s.matchResults)
        .set({ reason: "Rewrite history" })
        .where(eq(s.matchResults.matchId, match.id)),
    ).rejects.toThrow();
    await expect(
      execute(owner, {
        action: "roster.add",
        organizationId: org,
        teamId: report.participant.teamId,
        name: "New shared team player",
        role: "player",
      }),
    ).resolves.toHaveProperty("id");
  });
  it("releases venue reservations after deletion without removing historical schedules", async () => {
    const first = await create("single-elimination", "individual", 2),
      second = await create("single-elimination", "individual", 2);
    const venue = await execute(owner, {
      action: "venue.create",
      organizationId: org,
      name: `Delete venue ${randomUUID()}`,
      timezone: "UTC",
      kind: "court",
      availability: [{ start: "2026-12-02T09:00:00Z", end: "2026-12-02T10:00:00Z" }],
    });
    const schedule = async (id: string) =>
      execute(owner, {
        action: "schedule.generate",
        ...(await scoped(id)),
        idempotencyKey: randomUUID(),
        venueIds: [venue.id],
        maxConcurrent: 1,
      });
    await schedule(first);
    await expect(schedule(second)).rejects.toThrow();
    const t = await tournament(first);
    await execute(owner, {
      action: "tournament.delete",
      ...(await scoped(first)),
      confirmationName: t.name,
      idempotencyKey: randomUUID(),
    });
    await schedule(second);
    const bookings = await db
      .select()
      .from(s.schedules)
      .where(eq(s.schedules.venueId, String(venue.id)));
    expect(bookings).toHaveLength(2);
    expect(bookings[0].startsAt).toEqual(bookings[1].startsAt);
    const workspace = await getWorkspace(owner, org);
    expect(workspace.schedules.some((row) => row.tournamentId === first)).toBe(false);
    expect(workspace.schedules.some((row) => row.tournamentId === second)).toBe(true);
  });
  it("previews random teams without writes, then saves exactly the reviewed draw once", async () => {
    const settings = {
      playerNames: ["Alex", "Sam", "Jordan", "Abeer", "Taylor", "Morgan", "Alex"],
      splitMode: "team-count",
      splitValue: 3,
    };
    const before = await db.select().from(s.teams).where(eq(s.teams.organizationId, org));
    const preview = await execute(owner, {
      action: "teams.preview",
      organizationId: org,
      settings,
    });
    expect(await db.select().from(s.teams).where(eq(s.teams.organizationId, org))).toHaveLength(
      before.length,
    );
    const command = {
      action: "teams.generate",
      organizationId: org,
      assignment: { ...settings, teams: preview.teams },
      idempotencyKey: randomUUID(),
    };
    const saved = await execute(owner, command);
    expect(await execute(owner, command)).toEqual(saved);
    const created = saved.teams as { id: string; name: string }[];
    const planned = preview.teams as { name: string; players: { name: string; index: number }[] }[];
    expect(created.map((team) => team.name)).toEqual(planned.map((team) => team.name));
    for (const team of created) {
      const roster = await db
        .select({ name: s.players.name })
        .from(s.teamRosters)
        .innerJoin(s.players, eq(s.players.id, s.teamRosters.playerId))
        .where(eq(s.teamRosters.teamId, team.id));
      expect(roster.map((player) => player.name).sort()).toEqual(
        planned
          .find((p) => p.name === team.name)!
          .players.map((p) => p.name)
          .sort(),
      );
    }
    expect(await db.select().from(s.teams).where(eq(s.teams.organizationId, org))).toHaveLength(
      before.length + 3,
    );
    const next = await execute(owner, { action: "teams.preview", organizationId: org, settings });
    expect(
      (next.teams as { name: string }[]).every(
        (team) => !created.some((existing) => existing.name === team.name),
      ),
    ).toBe(true);
  });
  it("denies cross-tenant and manager generation and rolls back stale-name saves", async () => {
    const settings = {
      playerNames: ["Alex", "Sam", "Jordan", "Abeer"],
      splitMode: "team-size",
      splitValue: 2,
    };
    await expect(
      execute(outsider, { action: "teams.preview", organizationId: org, settings }),
    ).rejects.toThrow(/access/);
    const manager = randomUUID();
    await db
      .insert(s.user)
      .values({ id: manager, email: `${manager}@test.invalid`, name: "Team manager" });
    await db
      .insert(s.organizationMembers)
      .values({ organizationId: org, userId: manager, role: "manager" });
    await expect(
      execute(manager, { action: "teams.preview", organizationId: org, settings }),
    ).rejects.toThrow(/Organizers/);
    const preview = await execute(owner, {
      action: "teams.preview",
      organizationId: org,
      settings,
    });
    const planned = preview.teams as { name: string }[];
    await execute(owner, { action: "team.create", organizationId: org, name: planned[0].name });
    const before = await db.select().from(s.players).where(eq(s.players.organizationId, org));
    await expect(
      execute(owner, {
        action: "teams.generate",
        organizationId: org,
        assignment: { ...settings, teams: preview.teams },
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/now in use/);
    expect(await db.select().from(s.players).where(eq(s.players.organizationId, org))).toHaveLength(
      before.length,
    );
    expect(
      await db
        .select()
        .from(s.teams)
        .where(and(eq(s.teams.organizationId, org), eq(s.teams.name, planned[1].name))),
    ).toHaveLength(0);
  });
  it("persists drafts and generated matches without fixed roster requirements", async () => {
    const id = await create();
    expect(await db.select().from(s.matches).where(eq(s.matches.tournamentId, id))).toHaveLength(7);
    expect(
      await db.select().from(s.participants).where(eq(s.participants.tournamentId, id)),
    ).toHaveLength(8);
    expect((await tournament(id)).status).toBe("active");
  });
  it(
    "completes a 16-team double-elimination tournament transactionally",
    { timeout: 60000 },
    async () => {
      const id = await create("double-elimination", "team", 16);
      for (let i = 0; i < 40; i++) {
        const rows = await db
          .select()
          .from(s.matches)
          .where(and(eq(s.matches.tournamentId, id), eq(s.matches.status, "ready")));
        if (!rows.length) break;
        await execute(owner, {
          action: "match.result",
          ...(await scoped(id)),
          matchId: rows[0].id,
          scores: [2, 0],
          idempotencyKey: randomUUID(),
        });
      }
      expect((await tournament(id)).status).toBe("completed");
      expect((await tournament(id)).championId).toBeTruthy();
      expect(
        await db
          .select()
          .from(s.matches)
          .where(and(eq(s.matches.tournamentId, id), eq(s.matches.status, "completed"))),
      ).toHaveLength(30);
    },
  );
  it("prevents cross-tenant reads, commands and foreign-key mixing", async () => {
    const id = await create();
    await expect(getWorkspace(outsider, org)).rejects.toThrow(/access denied/);
    await expect(
      execute(outsider, {
        action: "tournament.publish",
        ...(await scoped(id)),
        visibility: "public",
      }),
    ).rejects.toThrow(/access/);
    await expect(
      db
        .insert(s.players)
        .values({ organizationId: otherOrg, name: "Other tenant" })
        .returning()
        .then(async ([player]) =>
          db.insert(s.participants).values({
            organizationId: org,
            tournamentId: id,
            playerId: player.id,
            seed: 90,
            name: "Cross tenant",
          }),
        ),
    ).rejects.toThrow();
  });
  it("idempotently replays exact results and rejects concurrent conflicting submissions", async () => {
    const id = await create(),
      [match] = await db
        .select()
        .from(s.matches)
        .where(and(eq(s.matches.tournamentId, id), eq(s.matches.status, "ready")));
    const c = {
      action: "match.result",
      ...(await scoped(id)),
      matchId: match.id,
      scores: [2, 0],
      idempotencyKey: randomUUID(),
    };
    const first = await execute(owner, c),
      replay = await execute(owner, c);
    expect(replay).toEqual(first);
    await expect(execute(owner, { ...c, scores: [0, 2] })).rejects.toThrow(/idempotency/);
    const [next] = await db
      .select()
      .from(s.matches)
      .where(and(eq(s.matches.tournamentId, id), eq(s.matches.status, "ready")));
    const a = { ...c, ...(await scoped(id)), matchId: next.id, idempotencyKey: randomUUID() },
      b = { ...a, scores: [0, 2], idempotencyKey: randomUUID() };
    const results = await Promise.allSettled([execute(owner, a), execute(owner, b)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(
      await db.select().from(s.matchResults).where(eq(s.matchResults.matchId, next.id)),
    ).toHaveLength(1);
  });
  it("retains versioned rules and acknowledgements after edits", async () => {
    const id = await create(),
      v1 = await rulebook(id, "warning");
    await execute(owner, {
      action: "rulebook.acknowledge",
      ...(await scoped(id)),
      versionId: v1.id,
    });
    const v2 = await rulebook(id, "final-warning");
    expect(v2.version).toBe(2);
    expect(
      (
        await db
          .select()
          .from(s.customRules)
          .where(eq(s.customRules.versionId, String(v1.id)))
      )[0].penalty,
    ).toBe("warning");
    expect(
      await db
        .select()
        .from(s.acknowledgements)
        .where(eq(s.acknowledgements.versionId, String(v1.id))),
    ).toHaveLength(1);
    await expect(
      db
        .update(s.customRules)
        .set({ penalty: "team-disqualification" })
        .where(eq(s.customRules.versionId, String(v1.id))),
    ).rejects.toThrow();
  });
  it("applies team disqualification once, preserves records, and safely reverses an appeal", async () => {
    const id = await create(),
      report = await reportCase(id);
    const c = {
      action: "case.decide",
      ...(await scoped(id)),
      caseId: report.caseId,
      penalty: "team-disqualification",
      policy: "preserve-results-forfeit-future",
      explanation: "The eligibility breach is verified by the referee report.",
      appealDeadline: new Date(Date.now() + 86400000).toISOString(),
      idempotencyKey: randomUUID(),
    };
    const decision = await execute(owner, c);
    await execute(owner, c);
    expect(
      await db
        .select()
        .from(s.penalties)
        .where(eq(s.penalties.decisionId, String(decision.id))),
    ).toHaveLength(1);
    expect(
      (
        await db.select().from(s.participants).where(eq(s.participants.id, report.participant.id))
      )[0].eligibility,
    ).toBe("disqualified");
    expect(
      await db.select().from(s.teams).where(eq(s.teams.id, report.participant.teamId!)),
    ).toHaveLength(1);
    const appeal = await execute(owner, {
      action: "appeal.submit",
      ...(await scoped(id)),
      decisionId: decision.id,
      reason: "The registration was verified against the correct roster.",
    });
    await expect(
      execute(owner, {
        action: "appeal.decide",
        ...(await scoped(id)),
        appealId: appeal.id,
        approved: true,
        explanation: "The roster is valid and the original decision is reversed.",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/independent/);
    await execute(reviewer, {
      action: "appeal.decide",
      ...(await scoped(id)),
      appealId: appeal.id,
      approved: true,
      explanation: "The roster is valid and the original decision is reversed.",
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await db.select().from(s.participants).where(eq(s.participants.id, report.participant.id))
      )[0].eligibility,
    ).toBe("eligible");
    expect(
      await db
        .select()
        .from(s.decisions)
        .where(eq(s.decisions.id, String(decision.id))),
    ).toHaveLength(1);
  });
  it("supports individual competitions and player disqualification without deleting the person", async () => {
    const id = await create("single-elimination", "individual", 3),
      report = await reportCase(id, "player-disqualification");
    await execute(owner, {
      action: "case.decide",
      ...(await scoped(id)),
      caseId: report.caseId,
      penalty: "player-disqualification",
      policy: "preserve-results-forfeit-future",
      explanation: "The individual eligibility violation is confirmed.",
      idempotencyKey: randomUUID(),
    });
    expect(
      await db.select().from(s.players).where(eq(s.players.id, report.participant.playerId!)),
    ).toHaveLength(1);
  });
  it("rejects unsafe reversal after subsequent results", async () => {
    const id = await create(),
      report = await reportCase(id);
    const decision = await execute(owner, {
      action: "case.decide",
      ...(await scoped(id)),
      caseId: report.caseId,
      penalty: "team-disqualification",
      policy: "preserve-results-forfeit-future",
      explanation: "The eligibility violation is confirmed after review.",
      appealDeadline: new Date(Date.now() + 86400000).toISOString(),
      idempotencyKey: randomUUID(),
    });
    const [match] = await db
      .select()
      .from(s.matches)
      .where(and(eq(s.matches.tournamentId, id), eq(s.matches.status, "ready")));
    await execute(owner, {
      action: "match.result",
      ...(await scoped(id)),
      matchId: match.id,
      scores: [2, 1],
      idempotencyKey: randomUUID(),
    });
    const appeal = await execute(owner, {
      action: "appeal.submit",
      ...(await scoped(id)),
      decisionId: decision.id,
      reason: "New registration information supports a reversal.",
    });
    await expect(
      execute(reviewer, {
        action: "appeal.decide",
        ...(await scoped(id)),
        appealId: appeal.id,
        approved: true,
        explanation: "The original registration information was incomplete.",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/changed/);
  });
  it("exposes only a safe public projection", async () => {
    const id = await create();
    const t = await tournament(id);
    expect(await getPublicTournament(t.slug)).toBeNull();
    await execute(owner, {
      action: "tournament.publish",
      ...(await scoped(id)),
      visibility: "public",
    });
    const data = await getPublicTournament(t.slug);
    expect(data?.entrants).toHaveLength(8);
    expect(JSON.stringify(data)).not.toMatch(
      /email|snapshot|reportedBy|objectKey|organizationId|createdBy/,
    );
  });
  it("serves fresh anonymous progress only while the tournament is public", async () => {
    const { GET } = await import("@/app/api/public/tournaments/[slug]/route");
    const id = await create("single-elimination", "individual", 2),
      t = await tournament(id);
    const read = (slug = t.slug) =>
      GET(new Request(`http://localhost/api/public/tournaments/${slug}`), {
        params: Promise.resolve({ slug }),
      });
    expect((await read()).status).toBe(404);
    expect((await read("not-a-tournament")).status).toBe(404);
    await execute(owner, {
      action: "tournament.publish",
      ...(await scoped(id)),
      visibility: "public",
    });
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const initial = await response.json();
    expect(initial.matches[0].scores).toBeNull();
    expect(JSON.stringify(initial)).not.toMatch(
      /email|snapshot|reportedBy|objectKey|organizationId|createdBy|draft|refereeId/,
    );
    const [match] = await db.select().from(s.matches).where(eq(s.matches.tournamentId, id));
    await execute(owner, {
      action: "match.result",
      ...(await scoped(id)),
      matchId: match.id,
      scores: [2, 0],
      idempotencyKey: randomUUID(),
    });
    const updated = await (await read()).json();
    expect(updated.matches[0].scores).toEqual([2, 0]);
    expect(updated.tournament.status).toBe("completed");
    expect(updated.tournament.championId).toBeTruthy();
    await execute(owner, {
      action: "tournament.publish",
      ...(await scoped(id)),
      visibility: "private",
    });
    expect((await read()).status).toBe(404);
    await execute(owner, {
      action: "tournament.publish",
      ...(await scoped(id)),
      visibility: "public",
    });
    await execute(owner, {
      action: "tournament.delete",
      ...(await scoped(id)),
      confirmationName: t.name,
      idempotencyKey: randomUUID(),
    });
    expect((await read()).status).toBe(404);
    const draft = await execute(owner, {
      action: "tournament.save",
      organizationId: org,
      expectedRevision: 0,
      draft: tournamentDraftSchema.parse({
        name: "Public draft remains hidden",
        sportId: "foosball",
        visibility: "public",
        entrantNames: ["One", "Two"],
        roster: {},
      }),
    });
    expect((await read((await tournament(String(draft.id))).slug)).status).toBe(404);
  });
  it("withdraws entrants without deleting their registrations or completed results", async () => {
    const id = await create(),
      [p] = await db.select().from(s.participants).where(eq(s.participants.tournamentId, id));
    await execute(owner, {
      action: "participant.withdraw",
      ...(await scoped(id)),
      participantId: p.id,
      policy: "preserve-results-forfeit-future",
      reason: "The team cannot attend the scheduled competition.",
      idempotencyKey: randomUUID(),
    });
    expect(
      (await db.select().from(s.participants).where(eq(s.participants.id, p.id)))[0].eligibility,
    ).toBe("withdrawn");
    expect(await db.select().from(s.matches).where(eq(s.matches.tournamentId, id))).toHaveLength(7);
  });
  it("blocks corrections after a knockout result depends on group qualification", async () => {
    const id = await create("group-stage-knockout", "individual", 8);
    const rows = await db.select().from(s.matches).where(eq(s.matches.tournamentId, id));
    const groupMatches = rows.filter((m) => m.stage.startsWith("group-"));
    for (const match of groupMatches)
      await execute(owner, {
        action: "match.result",
        ...(await scoped(id)),
        matchId: match.id,
        scores: [2, 0],
        idempotencyKey: randomUUID(),
      });
    const [semi] = await db
      .select()
      .from(s.matches)
      .where(and(eq(s.matches.tournamentId, id), eq(s.matches.key, "ko-semi-1")));
    await execute(owner, {
      action: "match.result",
      ...(await scoped(id)),
      matchId: semi.id,
      scores: [2, 0],
      idempotencyKey: randomUUID(),
    });
    await expect(
      execute(owner, {
        action: "match.correct",
        ...(await scoped(id)),
        matchId: groupMatches[0].id,
        scores: [0, 2],
        reason: "The original group-stage score was entered in reverse.",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow(/downstream/);
  });
  it("reserves shared venue capacity across tournaments", async () => {
    const first = await create("single-elimination", "individual", 4),
      second = await create("single-elimination", "individual", 4);
    const venue = await execute(owner, {
      action: "venue.create",
      organizationId: org,
      name: `Shared court ${randomUUID()}`,
      timezone: "UTC",
      kind: "court",
      availability: [{ start: "2026-12-01T09:00:00Z", end: "2026-12-01T20:00:00Z" }],
    });
    for (const id of [first, second])
      await execute(owner, {
        action: "schedule.generate",
        ...(await scoped(id)),
        idempotencyKey: randomUUID(),
        venueIds: [venue.id],
        maxConcurrent: 1,
      });
    const bookings = await db
      .select()
      .from(s.schedules)
      .where(eq(s.schedules.venueId, String(venue.id)));
    expect(bookings).toHaveLength(6);
    for (let i = 0; i < bookings.length; i++)
      for (let j = i + 1; j < bookings.length; j++)
        expect(
          bookings[i].endsAt <= bookings[j].startsAt || bookings[j].endsAt <= bookings[i].startsAt,
        ).toBe(true);
  });
  it("limits referees to their assigned match even after tournament assignment", async () => {
    const ref = randomUUID();
    await db
      .insert(s.user)
      .values({ id: ref, email: `${ref}@test.invalid`, name: "Match referee" });
    await db
      .insert(s.organizationMembers)
      .values({ organizationId: org, userId: ref, role: "referee" });
    const id = await create(),
      [match] = await db
        .select()
        .from(s.matches)
        .where(and(eq(s.matches.tournamentId, id), eq(s.matches.status, "ready")));
    const result = {
      action: "match.result",
      ...(await scoped(id)),
      matchId: match.id,
      scores: [1, 0],
      idempotencyKey: randomUUID(),
    };
    await expect(execute(ref, result)).rejects.toThrow(/role/);
    await execute(owner, {
      action: "tournament.assign",
      ...(await scoped(id)),
      userId: ref,
      role: "referee",
    });
    await expect(execute(ref, result)).rejects.toThrow(/assigned matches/);
    await execute(owner, {
      action: "match.assign",
      ...(await scoped(id)),
      matchId: match.id,
      userId: ref,
    });
    await expect(execute(ref, result)).resolves.toHaveProperty("id", match.id);
  });
  it("keeps evidence private and persists a signature-validated development object", async () => {
    process.env.EVIDENCE_DRIVER = "local";
    const { putEvidence, readEvidence, removeEvidence } =
      await import("@/modules/discipline/evidence-storage");
    const { authorizeEvidence } = await import("@/lib/evidence");
    const id = await create(),
      report = await reportCase(id),
      bytes = new TextEncoder().encode("%PDF-1.4\nprivate evidence test\n%%EOF");
    await expect(authorizeEvidence(outsider, report.caseId)).rejects.toThrow(/denied/);
    await expect(authorizeEvidence(owner, report.caseId)).resolves.toHaveProperty(
      "id",
      report.caseId,
    );
    const key = await putEvidence(report.caseId, bytes, "application/pdf");
    try {
      expect(await readEvidence(key)).toEqual(bytes);
    } finally {
      await removeEvidence(key);
    }
  });
  it("atomically enforces database rate limits under concurrent requests", async () => {
    const { consumeLimit } = await import("@/lib/rate-limit");
    const key = `test-${randomUUID()}`;
    const attempts = await Promise.all(Array.from({ length: 12 }, () => consumeLimit(key, 4, 60)));
    expect(attempts.filter((a) => a.allowed)).toHaveLength(4);
  });
});
