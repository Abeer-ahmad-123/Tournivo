import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { commandSchema, id } from "@/lib/contracts";
import { executeCommand } from "@/lib/services";
import { getTournamentDetail, getWorkspace } from "@/lib/queries";
import { AppError, invariant } from "@/lib/errors";
import { CompetitionError } from "@/modules/tournaments/types";
import { limitMutation } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ") },
      { status: 422 },
    );
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof CompetitionError)
    return Response.json({ error: error.message }, { status: 422 });
  // Drizzle wraps PostgreSQL errors; expose only a safe generic conflict message.
  const cause = error instanceof Error && "cause" in error ? error.cause : error;
  if (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    ["23505", "23503", "23514"].includes(String(cause.code))
  )
    return Response.json(
      { error: "This operation conflicts with an existing record or constraint." },
      { status: 409 },
    );
  console.error("Workspace request failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json(
    { error: "The request could not be completed. Please retry or contact your organizer." },
    { status: 500 },
  );
}
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    invariant(session, 401, "Sign in to continue.");
    const url = new URL(request.url),
      org = url.searchParams.get("organizationId"),
      tournamentId = url.searchParams.get("tournamentId");
    const data = tournamentId
      ? await getTournamentDetail(session.user.id, id.parse(tournamentId))
      : await getWorkspace(session.user.id, org ? id.parse(org) : undefined);
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin"),
      expected = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
    invariant(origin === expected, 403, "Request origin is not trusted.");
    invariant(
      Number(request.headers.get("content-length") ?? 0) <= 256000,
      413,
      "Request is too large.",
    );
    const session = await auth.api.getSession({ headers: request.headers });
    invariant(session, 401, "Sign in to continue.");
    const raw = await request.text();
    invariant(raw.length <= 256000, 413, "Request is too large.");
    await limitMutation(session.user.id);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError(400, "Invalid JSON request.");
    }
    return Response.json(await executeCommand(session.user.id, commandSchema.parse(body)));
  } catch (error) {
    return failure(error);
  }
}
