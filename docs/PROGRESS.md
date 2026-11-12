# Project progress

## Delivery status — 2026-11-12

The empty repository now contains a working, database-backed core platform. The complete production specification remains unfinished. No deployment or production-readiness claim is made.

| Phase | Verified implementation                                                                                                                                                                                   | Remaining work                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Repository inspection, all eight required design documents, strict Next.js, Better Auth account/session flows, responsive light/dark primitives, PostgreSQL/Drizzle migrations, private local environment | Email verification/recovery delivery, production operations and release review                                                                                    |
| 2     | 38-item structured catalog including Foosball, organizations, roles, teams, people, linked accounts, roster roles and explicit organizer limits                                                           | Full registration/approval lifecycle, editing/removing rosters with configurable change policies                                                                  |
| 3     | Eight-step persisted wizard; single/double elimination, single/double round robin, fixed two-group knockout                                                                                               | Other format strategies, configurable group sizes/qualification and arbitrary multi-stage composition                                                             |
| 4     | Fixtures, brackets, standings, scores, transactional progression, idempotency, corrections with downstream guards, withdrawals                                                                            | Series/map scoring, complete advanced statistics and organizer resolution tools                                                                                   |
| 5     | Resources and availability, checked automatic scheduling, UTC storage/IANA display, possible-entrant rest and dependency guards, cross-tournament venue capacity                                          | Calendar grid, manual rescheduling, persisted participant availability, shared teams across different tournaments                                                 |
| 6     | Independent builder, immutable version publication, effective dates, acknowledgement history, custom rules and escalation content                                                                         | Enforcing acknowledgement eligibility and historical incident-to-accepted-version policy                                                                          |
| 7     | Case reporting/review/response, scoped private evidence, published-policy penalties, team and individual disqualification, warnings, suspension state, appeals and conservative safe reversal             | Player penalties within team rosters, timed suspension expiry, arbitrary score/point penalties, complete escalation automation and organizer resolution workflows |
| 8     | Real dashboard, public safe projections, initial in-app notifications, audit log, browser print/save-to-PDF                                                                                               | Complete notification lifecycle/delivery, dedicated PDF report generation and banner/logo uploads                                                                 |
| 9     | Tenant isolation tests, concurrent results, distributed atomic limits, security audit and unsupported-format gating                                                                                       | Remaining strategies, load/security assessment, monitoring, backup/restore, retention and production infrastructure verification                                  |

## Implementation checklist

- [x] Preserve an empty environment and establish documented architecture.
- [x] Separate a person, team, roster and tournament registration.
- [x] Keep catalog suggestions out of mandatory roster constraints.
- [x] Keep algorithms independent of React and make server commands authoritative.
- [x] Verify elimination and league mathematics, byes, odd counts, reset finals and group qualification.
- [x] Enforce tenant boundaries and transaction-safe outcomes with optimistic revisions and idempotency.
- [x] Preserve results and registrations after withdrawal or disqualification.
- [x] Block unsafe corrections/reversals instead of undoing dependent matches.
- [x] Exclude evidence, account data and case history from public pages.
- [x] Validate actual database and browser workflows.
- [x] Document ordinary technical decisions and incomplete features.
- [ ] Complete the full nine-phase product scope and every production release gate.

## Validation record

The verification commands and final counts are recorded below after the final pass. Integration tests use `tournivo_test`; browser tests create explicitly named test records in the local development database. No production database was touched.

Verified after hardening: 51 unit tests, 15 PostgreSQL integration tests, and all 3 Playwright tests. The main browser test covers authentication → saved/reloaded draft → fixtures → score → bracket → mobile layout → rulebook → evidence → disciplinary decision → public page in a separate unauthenticated context. The other tests cover anonymous/origin guards and failed generation retrying against exactly one saved draft. The final browser suite passed in 13.5 seconds when run alone.

Type checking, linting and formatting pass. All four migrations apply, including database-enforced immutable history. The dependency audit reports zero vulnerabilities. Earlier simultaneous checks on the busy local host exceeded test timing budgets; the isolated browser rerun passed all scenarios. The final optimized production build passes, including all application pages and authentication, workspace and private-evidence routes. No cloud deployment was performed.

## Random teams update — 2026-11-12

- Added **Generate random teams** in Teams & players and the tournament wizard's Participants step.
- Enter names on separate lines or separated by commas; choose a team count or maximum players per team. The server shuffles players and generates unique team names without applying catalog roster restrictions.
- Preview and reshuffle before saving. Saving persists exactly the displayed teams and rosters in one transaction. Repeated names remain distinct people, remainder players are retained, stale name conflicts are rejected, and retries do not duplicate a saved draw.
- Validation: 64 unit tests, 17 isolated PostgreSQL integration tests and all 5 browser tests pass. The new browser tests cover saved/reloaded teams, mobile layout, and reuse of generated rosters in a tournament. The user's existing development server remains running; browser checks use a separate preview and local test database.
- Type checking, linting, formatting and the optimized production build pass. The build was verified in the isolated source copy so the running development server's cache stayed in place. No database migration or new dependency was needed.

## Tournament deletion update — 2026-11-12

- Added **Delete tournament** to the tournament header for owners, organizers and assigned tournament admins. Draft, active and completed tournaments use an exact-name confirmation with cancellation, pending-state protection and visible errors.
- Deletion is audited, revision-checked and idempotent. Migration 0004 adds a nullable deletion timestamp; deleted tournaments leave workspace lists/counts, direct detail/evidence access and public pages, and reject later mutations. Shared teams/players and immutable history remain. Venue reservations and shared roster locks are released. No restore UI is available.
- Validation: 64 unit tests, 20 isolated PostgreSQL integration tests and all 7 browser tests pass. Browser tests verify cancellation, confirmation gating, delete/reload persistence, public unavailability and the mobile dialog. The test setup respects real auth sign-up throttling without weakening app limits. Type checking, linting and formatting pass.
- The additive migration was applied to the configured app database without deleting existing records. Browser checks ran against the isolated local test database and source copy; the existing development server was left running.
- The optimized production build passes in the isolated source copy. No new dependency or cloud deployment was needed.

## Anonymous sharing and progress update — 2026-11-12

- Added **Share tournament → Enable public link → Copy link** for generated competitions. Spectators open the public URL without an account or login. A local-address hint distinguishes localhost links from publicly reachable hosted links.
- Added a completion bar, completed/total matches, ready matches and current round to the public page. Existing fixtures, results, brackets, standings and champion update every 15 seconds while visible, on focus/return online, or through Refresh progress. Progress excludes byes and unused conditional grand-final resets, and avoids premature rounding to 100%.
- Anonymous updates use a no-store, read-only safe projection. Unpublished, deleted, missing and draft tournaments are unavailable. Already-open spectator pages remove results when access is revoked; temporary update failures preserve the last confirmed data with a retry message.
- Validation: 70 unit tests, 21 isolated PostgreSQL integration tests and all 8 browser tests pass, along with type checking, linting, formatting and the optimized production build. Browser coverage exercises sharing/copy, no-login access, automatic result/champion updates, recovery after an update failure, revocation and the fluid layout at 390px and 2560px. The existing development server and configured application database were left untouched by test data. No migration, new dependency or deployment was required.
