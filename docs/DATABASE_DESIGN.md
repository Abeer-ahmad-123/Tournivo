# Database design

PostgreSQL UUID identities, timestamptz audit times, foreign keys, unique constraints and organization indexes. Tenant identifiers accompany tournament-owned records. Services validate cross-record organization and tournament identity; public access uses an explicit projection.

Identity: users, sessions, accounts, verifications (Better Auth). Tenancy: organizations, organization_members, tournament_members. Catalog: sports (sport/esport/custom structured seed). Competition: tournaments, tournament_stages, participants, teams, players, team_rosters, matches, match_results, venues, schedules. Governance: rulebooks, rulebook_versions, custom_rules, rule_acknowledgements, disciplinary_cases, disciplinary_evidence, disciplinary_decisions, penalties, appeals. Operations: notifications, audit_logs, idempotency_keys.

Tournament settings and drafts are validated JSON for extensible configurations; relational identities and mutable outcomes remain normalized. Published rulebook rule content is immutable. A registered person, a team, a roster membership and tournament registration never share an identity. There is no sport-derived fixed roster-size database constraint.

Tournament deletion uses nullable `tournaments.deleted_at` (migration 0004). It preserves relational and immutable history, records an audit event, makes the tournament private and increments its revision. Normal reads and tournament mutations exclude deleted rows. Historical schedules remain stored but cease reserving venues; shared teams, players, rosters and venues remain available. Deleted registrations no longer lock shared rosters. There is no user-facing recovery or purge workflow.

Critical writes serialize per tournament and commit outcomes, progression, decisions and audit logs together. Result submissions include expected revision and idempotency key; keys are unique per organization and command scope. Penalties have a unique decision reference. Completed historical results remain after disqualification. Appeal reversal can require manual resolution if downstream matches have started.

Run npm run db:generate for versioned migration changes and npm run db:migrate to apply. Integration tests use an isolated test database and never erase development or production data.
