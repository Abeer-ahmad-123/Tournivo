# System architecture

## Repository inspection — 2026-11-12

The repository was empty, including hidden files. No Git repository, environment files, framework, dependencies, database schema, authentication or conventions existed. Node 26 and npm 11 are installed. PostgreSQL CLI/server binaries are available; no default server was responding. No parent AGENTS.md applies. No credentials were read or printed.

## Architecture

Next.js App Router + strict TypeScript + React, Tailwind and accessible Radix/shadcn-style components. React Hook Form and Zod own client forms; Zod also validates server input. Route handlers call application services; pure tournament, scheduling, eligibility and rulebook logic has no React or database dependency. Drizzle with PostgreSQL owns persistence and versioned SQL migrations. Better Auth provides established cookie/session/password handling; no custom cryptographic session implementation.

Request flow: authenticated session → database membership/permission lookup → validated command → organization-scoped transaction → audit event → safe projection. All authoritative progression is server-side. Result updates lock the tournament row and use expected revisions and idempotency keys. The same lock order is required for decisions and appeals.

## Runtime and deployment

Node runtime, Vercel-compatible. Managed PostgreSQL in production. Local PostgreSQL under ignored .local is for development/tests only. No Redis or BullMQ until jobs need durable asynchronous execution. Private S3-compatible evidence storage requires real deployment configuration. Do not silently replace missing PostgreSQL with browser storage or seed demo data in production. Next.js deployment remains in the requested repository; no incompatible static hosting conversion.

## Module boundaries

- src/modules/tournaments: format strategies, progression, standings.
- src/modules/scheduling: constraint validation and allocation.
- src/modules/participants: explicitly configured roster constraints.
- src/modules/rulebooks: immutable versions and acknowledgements.
- src/modules/discipline: case transitions, penalties and safe reversal planning.
- src/lib: authentication, authorization, command services and API boundaries.
- src/db: schema, connection, migration and seed.

## Operational requirements

Apply migrations before startup. TLS for production database; configure connection pooling, trusted base URL and strong auth secret. Backups, recovery drills, distributed abuse controls, observability and managed storage are release gates, not assumptions.

## Framework references

Implementation was checked against the installed Next.js agent guidance and [App Router documentation](https://nextjs.org/docs/app/getting-started), [Better Auth installation](https://better-auth.com/docs/installation) and [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), and [Drizzle PostgreSQL transactions](https://orm.drizzle.team/docs/transactions). Exact resolved dependency versions are pinned by package-lock.json.
