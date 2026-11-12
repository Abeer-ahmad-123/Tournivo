# Tournivo

**Every Competition. Perfectly Organized.**

A database-backed sports and esports tournament platform built with Next.js App Router, strict TypeScript, React, Tailwind, Radix/shadcn-style UI, Better Auth, PostgreSQL and Drizzle. This repository contains a tested core implementation and an explicit roadmap; the complete production specification is **not yet finished**.

## Run locally

Prerequisites: Node 22 or newer, npm, PostgreSQL binaries (`initdb`, `pg_ctl`, `createdb`, `psql`) on PATH. PostgreSQL 18 was used for local verification. No Docker or paid cloud account is required for development.

```sh
npm ci
npm run setup:env
npm run db:local
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000 and create an account. Create an organization, then a tournament. No default login or hardcoded dashboard statistics exist. The seed command adds only the maintainable catalog of 38 sports, games and custom categories, including Foosball.

The local database lives in ignored `.local/postgres`, binds only to loopback port 55432, and uses development trust authentication. It is separate from the machine's default database. To stop it:

```sh
pg_ctl -D .local/postgres stop
```

If using an existing PostgreSQL service, copy `.env.example` to `.env`, configure `DATABASE_URL` and a separate `TEST_DATABASE_URL` ending in `_test`, and generate a strong `BETTER_AUTH_SECRET`. Skip `db:local`.

## Verified core

- Account registration, password sign-in, database sessions, organization membership, assigned tournament roles and per-match referee authorization.
- Teams, linked people, captains, substitutes, coaches/managers and explicit organizer roster limits. Catalog sizes are suggestions. Generated tournament rosters are locked pending a complete roster-change-policy workflow.
- Random team generation from player names, available in **Teams & players** and the wizard's **Participants** step. Split by team count or maximum team size, preview/reshuffle the balanced draw, then save its generated team names and player rosters. Every entered player is retained; repeated names represent separate people. Supports up to 256 entered players per draw.
- Eight-step wizard with database drafts, seeding, unrestricted team sizes and individual registrations.
- Tournament deletion from the tournament header for owners, organizers and assigned tournament admins. Confirm the name to remove drafts, active or completed competitions from the workspace and public pages. Shared teams/players and immutable history are retained; venue reservations are released. No restore UI is provided.
- Single elimination with byes; double elimination with lower bracket and conditional grand-final reset; single and double round robin; a two-group round-robin stage with the top two per group advancing to semifinals and final.
- Brackets, fixtures, results, standings, winner advancement, audited corrections and guarded withdrawal/forfeit progression.
- UTC scheduling with venue windows, possible-entrant conflicts, dependencies, rest, concurrency and cross-tournament resource bookings. Automatic scheduling is locked once results start.
- Database-enforced immutable published rulebook versions, effective dates, acknowledgements, custom policies and escalation definitions.
- Case investigation transitions, affected-participant responses, idempotent warnings/suspensions/disqualification decisions, appeal deadlines, independent review and guarded reversals. Arbitrary points/score adjustments and player-specific penalties within team rosters remain incomplete.
- Private evidence upload/download with size/type/signature validation. Development-only private local storage; configurable S3/R2-compatible production storage. Evidence metadata and objects are excluded from public projections.
- Real dashboard metrics, audit history, initial in-app notifications, public tournament pages and browser print/save-to-PDF layouts.
- **Share tournament → Enable public link → Copy link** lets spectators follow a generated tournament without login. Public pages show completion progress, fixtures, scores, brackets, standings and the champion; they refresh every 15 seconds while visible, on return/focus and on manual refresh. Making the tournament private or deleting it revokes public access. Remote spectators need a publicly hosted app address; localhost links work only on the current computer.
- Server-side validation, tenant guards, composite foreign keys, tournament locking, optimistic revisions, idempotency and PostgreSQL-backed atomic rate limits.

## Verify

```sh
npm run check
npm run test:integration
npm run test:e2e
npm run build
npm audit
```

Integration tests refuse to run without an isolated database ending in `_test`. They create uniquely named records there and do not truncate application data. Browser tests use local Chrome and create clearly named test accounts/competitions in the **development** database. Never point browser tests at production. Playwright can start/reuse the local development server.

```sh
npm run format:check
npm run db:generate
```

Migrations are tracked under `drizzle/`. Changes to the schema require generating and reviewing a migration, then applying it to development and test databases.

## Production deployment

Deploy the Node Next.js app to a Vercel-compatible host with managed PostgreSQL. Run migrations as a release step. Configure a production HTTPS `BETTER_AUTH_URL`, a random `BETTER_AUTH_SECRET`, and the database connection URL. Missing production database configuration fails closed.

For evidence, set `EVIDENCE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT`, and standard AWS access credentials/role. R2 uses its S3-compatible endpoint. The bucket must be private with no public ACL or public read policy. Local evidence storage is rejected in production. No cloud infrastructure or production deployment was created.

Complete the release gates in [SECURITY.md](docs/SECURITY.md) and the outstanding work in [KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) before a production launch. In particular, verification email/password recovery delivery, full advanced formats, public registration, complete scoped disciplinary workflows, production object-store checks, load testing, backup/restore, observability and retention operations remain outstanding.

## Architecture and delivery status

Read [product requirements](docs/PRODUCT_REQUIREMENTS.md), [system architecture](docs/SYSTEM_ARCHITECTURE.md), [database design](docs/DATABASE_DESIGN.md), [tournament engine](docs/TOURNAMENT_ENGINE.md), [scheduling engine](docs/SCHEDULING_ENGINE.md), [rulebooks and discipline](docs/RULEBOOK_AND_DISCIPLINARY_ENGINE.md), [security](docs/SECURITY.md), [roadmap](docs/IMPLEMENTATION_ROADMAP.md), [progress](docs/PROGRESS.md), and [technical decisions](docs/DECISIONS.md).
