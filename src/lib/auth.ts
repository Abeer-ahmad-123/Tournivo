import { betterAuth } from "better-auth";
import { randomUUID } from "node:crypto";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db";
import { user, session, account, verification } from "@/db/schema";
import { consumeLimit } from "./rate-limit";
export const auth = betterAuth({
  appName: "Tournivo",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customStorage: { consume: (key, rule) => consumeLimit(`auth:${key}`, rule.max, rule.window) },
  },
  advanced: {
    database: { generateId: () => randomUUID() },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  logger: {
    log(level) {
      if (level === "error" || level === "warn") console.error(`Authentication event: ${level}`);
    },
  },
});
