# Known issues and incomplete features

The application has a working, verified core. The complete requested platform is not finished and should not be launched as production-ready yet.

## Product gaps

1. Advanced formats other than the five registered strategies remain unavailable. The library explicitly marks them planned. Swiss/McMahon/ladder, triple/modified elimination, Page/gauntlet, custom stages and most hybrids are not implemented.
2. Group knockout is explicitly two seeded groups with two qualifiers each, fixed 3/1/0 scoring and original seed as the final qualification tiebreak. Arbitrary group counts, qualifying policies and stage graphs are not supported.
3. Public player/team registration, deadlines/approval queues and participant self-service onboarding are incomplete. Generation accepts manual registration only.
4. Rosters lock when used in a generated tournament. Configurable roster-change policies, removal/edit history, dedicated active-lineup selection and temporary substitutes remain outstanding. Doubles/relay/custom structures currently use team registrations with organizer roster policies.
5. Player-specific disqualification inside a team roster is safely rejected; individual player competitions and whole-team penalties work. Point deductions, arbitrary score adjustments and case-specific match forfeits require an explicit adjustment implementation. Suspensions do not yet have automatic expiry. Escalation definitions are stored but repeat counts are not automatically enforced.
6. Published acknowledgements persist, but renewed acknowledgement is not yet a registration/playing eligibility gate. Cases need richer incident timestamps and historical accepted-rule selection. Evidence authenticity remains a reviewer responsibility; magic-byte validation is not malware scanning.
7. Appeals can safely reverse when the tournament revision has not changed. Unrelated tournament configuration changes also block automatic reversal. There is no dedicated organizer resolution editor for ambiguous cases, two ineligible opponents, insufficient group qualifiers or already-played dependencies.
8. Scheduling has a tested pure participant-availability solver, but the application does not yet persist participant windows. Shared resources are protected across tournaments; a shared person/team entering separate tournaments needs additional global participant conflict checks. Automatic rescheduling is deliberately locked after the first result. Manual rescheduling and a calendar grid are missing.
9. Scores represent one final match outcome. Best-of series, map-level scores, sport-specific scorecards and advanced statistics remain incomplete.
10. Banner/logo uploads, full administrative settings, a platform super-admin console and membership removal/ownership transfer are missing. Tournament role and referee assignments are implemented. Fine-grained organization role customization is not yet exposed.
11. Notification persistence/UI and initial case notification are implemented; complete decision/appeal/result notification delivery, email/webhooks and durable background jobs remain outstanding.
12. Exports use the browser's print/save-to-PDF support. There is no dedicated server-generated report/PDF download service or tested large-bracket pagination.

## Production release gates

- Configure and verify production PostgreSQL, HTTPS authentication origin, credentials, session lifecycle, backups and a recovery drill. Development services under `.local` are not production infrastructure.
- Wire verified email delivery for account verification and recovery; current registration immediately opens an authenticated workspace.
- Verify a real private S3/R2 bucket, access policies, quotas, retention, malware scanning and failure recovery. Only the local private storage driver has been exercised end to end in this session. Production rejects the local driver.
- Perform external security review, accessibility assessment, broad browser coverage, load/concurrency testing and monitoring/alerting. Local integration tests do not establish production scalability.
- Organization-level advisory locking conservatively serializes mutations and cross-tournament resource reservations. Finer-grained locking and job queues require throughput measurement.
- Add retention/cleanup for expired rate-limit rows and idempotency receipts with an explicit audit retention policy.
- The added GitHub Actions workflow has not run on a remote CI runner. Local commands are the verification evidence.
- No cloud deployment, Redis service, object bucket or paid resource was created.
