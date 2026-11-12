import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const directory = resolve(".local/postgres");
function run(command, args, quiet = false) {
  const result = spawnSync(command, args, { stdio: quiet ? "pipe" : "inherit", encoding: "utf8" });
  if (result.error) throw new Error(`${command} is required on PATH. Install PostgreSQL first.`);
  return result;
}
mkdirSync(resolve(".local"), { recursive: true, mode: 0o700 });
if (!existsSync(resolve(directory, "PG_VERSION"))) {
  if (run("initdb", ["-D", directory, "-A", "trust", "--no-locale", "-E", "UTF8"]).status !== 0)
    process.exit(1);
}
if (run("pg_ctl", ["-D", directory, "status"], true).status !== 0) {
  if (
    run("pg_ctl", [
      "-D",
      directory,
      "-l",
      resolve(".local/postgres.log"),
      "-o",
      "-p 55432 -h 127.0.0.1 -k /tmp",
      "start",
    ]).status !== 0
  )
    process.exit(1);
}
for (const name of ["tournivo", "tournivo_test"]) {
  const result = run(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55432",
      "-d",
      "postgres",
      "-Atc",
      `SELECT datname FROM pg_database WHERE datname = '${name}'`,
    ],
    true,
  );
  if (
    !result.stdout?.trim() &&
    run("createdb", ["-h", "127.0.0.1", "-p", "55432", name]).status !== 0
  )
    process.exit(1);
}
console.log(
  "Project development PostgreSQL is ready on 127.0.0.1:55432. Development trust authentication is loopback-only; never use this cluster for production.",
);
