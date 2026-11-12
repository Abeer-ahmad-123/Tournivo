import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
  throw new Error("DATABASE_URL must be configured in production.");
const globalDb = globalThis as unknown as { tournivoSql?: ReturnType<typeof postgres> };
export const sqlClient =
  globalDb.tournivoSql ??
  postgres(process.env.DATABASE_URL ?? "postgres://localhost:55432/tournivo", {
    max: 10,
    prepare: false,
    onnotice: () => {},
  });
if (process.env.NODE_ENV !== "production") globalDb.tournivoSql = sqlClient;
export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
