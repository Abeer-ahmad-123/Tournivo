# Tournivo product requirements

Brand: Tournivo. Every Competition. Perfectly Organized.

The product manages organization-scoped sports and esports competitions. People, teams, tournament registrations and roster memberships are distinct. Catalog roster sizes are suggestions; only explicit organizer restrictions are enforced. Active lineups are distinct from total registered rosters.

## Core workflows

1. Register/sign in, create an organization, and assign organization or tournament responsibilities.
2. Create an eight-step, persisted tournament draft; configure participants, competition rules, scheduling and registration independently of a versioned conduct rulebook.
3. Generate validated fixtures with a registered server-side format strategy; record results, advance winners and calculate standings transactionally.
4. Schedule dependency-aware fixtures across venues, respecting availability, rest and concurrency.
5. Publish rulebooks, acknowledge immutable versions, report violations, investigate cases, issue idempotent decisions and process appeals without destroying history.
6. Publish safe tournament projections and inspect real database-backed dashboard metrics, notifications and audit history.

## Acceptance boundaries

UI presence does not imply implementation. A format is selectable for generation only after generation, progression and edge cases have tests. Unsupported strategies must be visibly unavailable. Empty dashboards are valid; demo records must be explicitly seeded, never manufactured as production statistics. Private evidence never appears in public projections. Ambiguous disciplinary progression requires an explicit policy and review. No hidden roster-size restrictions.

## Full scope

Authentication, organizations, catalog, teams/people/registrations, format library, wizard, brackets, fixtures, standings, scheduling, rulebooks, disciplinary cases, eligibility, appeals, public pages, notifications, reporting, settings and audit history. See IMPLEMENTATION_ROADMAP.md and PROGRESS.md for verified delivery status.
