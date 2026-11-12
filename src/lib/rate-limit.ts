import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiLimits } from "@/db/schema";
import { invariant } from "./errors";
// PostgreSQL upsert makes the counter atomic across processes and serverless instances.
// Auth uses the provider's atomic custom storage implementation below as well.
export async function consumeLimit(key: string, max: number, windowSeconds: number) {
  const [result] = await db
    .insert(apiLimits)
    .values({ key, hits: 1, resetsAt: new Date(Date.now() + windowSeconds * 1000) })
    .onConflictDoUpdate({
      target: apiLimits.key,
      set: {
        hits: sql`case when ${apiLimits.resetsAt} <= now() then 1 else ${apiLimits.hits} + 1 end`,
        resetsAt: sql`case when ${apiLimits.resetsAt} <= now() then now() + ${windowSeconds} * interval '1 second' else ${apiLimits.resetsAt} end`,
      },
    })
    .returning();
  return {
    allowed: result.hits <= max,
    retryAfter: Math.max(1, Math.ceil((result.resetsAt.getTime() - Date.now()) / 1000)),
  };
}
export async function limitMutation(actorId: string, kind = "mutation", max = 120) {
  const result = await consumeLimit(`${kind}:${actorId}`, max, 60);
  invariant(result.allowed, 429, `Too many requests. Try again in ${result.retryAfter} seconds.`);
}
