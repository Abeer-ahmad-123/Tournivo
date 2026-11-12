import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { evidence, auditLogs } from "@/db/schema";
import { id } from "@/lib/contracts";
import { AppError, invariant } from "@/lib/errors";
import { authorizeEvidence } from "@/lib/evidence";
import { limitMutation } from "@/lib/rate-limit";
import { putEvidence, readEvidence, removeEvidence } from "@/modules/discipline/evidence-storage";
export const runtime = "nodejs";
function failure(e: unknown) {
  return Response.json(
    { error: e instanceof AppError ? e.message : "Unable to process evidence." },
    { status: e instanceof AppError ? e.status : 422 },
  );
}
export async function POST(request: Request) {
  try {
    invariant(
      request.headers.get("origin") ===
        new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin,
      403,
      "Request origin is not trusted.",
    );
    invariant(
      Number(request.headers.get("content-length") ?? Infinity) <= 11 * 1024 * 1024,
      413,
      "Evidence request is too large.",
    );
    const session = await auth.api.getSession({ headers: request.headers });
    invariant(session, 401, "Sign in to continue.");
    const data = await request.formData(),
      caseId = id.parse(data.get("caseId"));
    await limitMutation(session.user.id, "evidence", 20);
    const report = await authorizeEvidence(session.user.id, caseId);
    invariant(
      !["closed", "dismissed", "appeal_rejected", "appeal_approved"].includes(report.status),
      409,
      "This case no longer accepts evidence.",
    );
    const file = data.get("file");
    invariant(file instanceof File, 422, "Choose an evidence file.");
    invariant(file.size <= 10 * 1024 * 1024, 413, "Evidence files must be no larger than 10 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer()),
      key = await putEvidence(caseId, bytes, file.type);
    try {
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(evidence)
          .values({
            caseId,
            uploadedBy: session.user.id,
            objectKey: key,
            mimeType: file.type,
            size: file.size,
          })
          .returning({ id: evidence.id });
        await tx.insert(auditLogs).values({
          organizationId: report.organizationId,
          actorId: session.user.id,
          action: "evidence.upload",
          entityId: row.id,
          details: { caseId, mimeType: file.type, size: file.size },
        });
        return row;
      });
      return Response.json(result, { status: 201 });
    } catch (e) {
      await removeEvidence(key);
      throw e;
    }
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    invariant(session, 401, "Sign in to continue.");
    const evidenceId = id.parse(new URL(request.url).searchParams.get("id"));
    const [file] = await db.select().from(evidence).where(eq(evidence.id, evidenceId));
    invariant(file, 404, "Evidence not found.");
    const report = await authorizeEvidence(session.user.id, file.caseId);
    const bytes = await readEvidence(file.objectKey);
    await db.insert(auditLogs).values({
      organizationId: report.organizationId,
      actorId: session.user.id,
      action: "evidence.download",
      entityId: file.id,
    });
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="evidence-${file.id}.${file.objectKey.split(".").at(-1)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
