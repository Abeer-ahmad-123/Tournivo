# Rulebooks, discipline and appeals

Conduct rules are independent from scoring, durations, formats and scheduling. Rules have stable IDs, category, affected entity, severity, conditions, evidence requirements, penalty/escalation policy, effective time and appeal eligibility. Published versions are immutable; edits publish a new version and preserve acknowledgements. Effective versions must not retroactively replace the accepted policy without a separately recorded explicit policy.

Cases move through submitted, under_review, awaiting_response, evidence_requested, decision_pending, confirmed/dismissed, appealed, appeal_approved/appeal_rejected and closed. Only authorized reviewers decide cases. A decision records actor, rule version, reason, penalty and evidence references. A unique decision application prevents duplicates.

Disqualification changes eligibility, never deletes players or teams. Explicit published policy controls future forfeits and standings deductions. A tournament lock surrounds eligibility, result/progression changes and audit history. Ambiguity blocks application pending organizer resolution.

Appeals record deadline, reason, reviewer and evidence. Reviewer separation is enforced for reversals. Reversal first checks downstream dependencies; completed subsequent matches must not be automatically undone. Historical decisions and penalties remain recorded after reversal.

Evidence storage must use private S3/R2 objects, validated size/content/type, scoped presigned operations and authorization on download. Until configured, evidence upload must be unavailable rather than exposing public URLs.
