# Security model

Better Auth handles password hashing, sessions and CSRF-sensitive auth endpoints. Secure production cookies and an explicit trusted application origin are required. All business mutations authenticate server-side, resolve a database membership, validate Zod input and reject cross-tenant object references. No caller-supplied role is trusted.

Permissions distinguish owners, organizers, admins, referees, managers, players and spectators. Match-assignment checks are required for referee submissions; manager roster access is scoped to the manager's team. Unsupported scoped roles receive no broad write access.

Application transactions lock tournaments in a consistent order. Idempotency receipts bind operation, actor and request payload; stale revisions and conflicting replay payloads are rejected. Public routes select a whitelist and omit email, session, draft settings, evidence, disciplinary details and internal audit records.

Anonymous progress updates at `GET /api/public/tournaments/[slug]` use the same safe projection as public HTML and disable caching. Private, deleted, missing and draft tournaments return 404. Public sharing requires an authorized publish command; the anonymous endpoint supports no mutations. Already-open public pages remove their displayed tournament at the next refresh after access is revoked, normally within 15 seconds while visible. Information previously received by a spectator cannot be recalled from their browser.

Authentication and business mutations use an atomic PostgreSQL upsert counter, shared across application instances. Uploads have their own stricter counter. Counter retention and production load tests remain release gates. Evidence uploads validate size, allowed MIME type and file signature before writing to private storage. Downloads repeat case/tenant authorization, force attachment disposition and disable caching, sniffing and active content. The local object driver is rejected in production. Real object-store configuration and malware scanning still require release review.

Authentication logs use a redacting logger. Business errors return safe messages; raw query parameters and provider error objects are not exposed. Environment files and local database storage are ignored. Production startup fails without the database configuration. No default credentials or unauthenticated demo bypass exists.

SQL migration 0003 rejects update/delete operations on published rules/versions, acknowledgements, disciplinary decisions, match result history and audit logs. Corrections append history. A trigger rejects cross-tournament disciplinary rule references; a composite foreign key constrains champions to their own tournament registration.

Release gates: dependency audit, tenant isolation integration tests, CSRF/origin checks, concurrent update tests, backup/restore, abuse tests, object-store policy review and production configuration review. Status in KNOWN_ISSUES.md is authoritative.
