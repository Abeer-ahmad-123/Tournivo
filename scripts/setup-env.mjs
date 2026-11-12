import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    [
      "DATABASE_URL=postgres://127.0.0.1:55432/tournivo",
      "TEST_DATABASE_URL=postgres://127.0.0.1:55432/tournivo_test",
      "BETTER_AUTH_URL=http://localhost:3000",
      `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
      "EVIDENCE_DRIVER=local",
      "",
    ].join("\n"),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Created ignored .env with a random authentication secret. Existing configuration is never overwritten.",
  );
} else console.log("Existing .env retained.");
