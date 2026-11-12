import "dotenv/config";
import { db, sqlClient } from "../src/db";
import { sports } from "../src/db/schema";
import { catalogSeed } from "../src/db/catalog";
try {
  await db.insert(sports).values(catalogSeed).onConflictDoNothing();
  console.log(
    `Catalog seeded: ${catalogSeed.length} configurable sports and games. No users or fake statistics created.`,
  );
} finally {
  await sqlClient.end();
}
