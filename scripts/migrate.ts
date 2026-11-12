import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sqlClient } from "../src/db";
try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Database migrations applied.");
} finally {
  await sqlClient.end();
}
