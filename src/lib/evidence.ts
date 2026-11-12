import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { invariant } from "./errors";
export async function authorizeEvidence(actorId: string, caseId: string) {
  const [report] = await db
    .select()
    .from(s.disciplinaryCases)
    .where(eq(s.disciplinaryCases.id, caseId));
  invariant(report, 404, "Case not found.");
  const [tournament] = await db
    .select({ id: s.tournaments.id })
    .from(s.tournaments)
    .where(and(eq(s.tournaments.id, report.tournamentId), isNull(s.tournaments.deletedAt)));
  invariant(tournament, 404, "Case not found.");
  const [member] = await db
    .select()
    .from(s.organizationMembers)
    .where(
      and(
        eq(s.organizationMembers.organizationId, report.organizationId),
        eq(s.organizationMembers.userId, actorId),
      ),
    );
  invariant(member, 403, "Evidence access denied.");
  const [assigned] = await db
    .select()
    .from(s.tournamentMembers)
    .where(
      and(
        eq(s.tournamentMembers.tournamentId, report.tournamentId),
        eq(s.tournamentMembers.userId, actorId),
      ),
    );
  const [p] = await db
    .select()
    .from(s.participants)
    .where(eq(s.participants.id, report.participantId));
  const affected = p.teamId
    ? (await db.select().from(s.teams).where(eq(s.teams.id, p.teamId)))[0]?.managerId
    : p.playerId
      ? (await db.select().from(s.players).where(eq(s.players.id, p.playerId)))[0]?.userId
      : null;
  invariant(
    ["owner", "organizer"].includes(member.role) ||
      assigned?.role === "admin" ||
      report.reportedBy === actorId ||
      affected === actorId,
    403,
    "Evidence access denied.",
  );
  return report;
}
