# Scheduling engine

UTC instants are persisted; IANA zones describe organizer input and display. A schedule is valid only after venue, entrant, match dependency, rest, duration, availability and concurrency checks. Half-open time intervals allow adjacent bookings when rest is zero. Unresolved bracket participants use possible-entrant sets to avoid unsafe assumptions.

Automatic allocation topologically sorts match dependencies, selects the earliest available resource, and checks constraints after allocation. Impossible dependencies, cycles, insufficient availability and invalid intervals produce actionable errors. No silently truncated schedule. Manual rescheduling must run identical validation. Optimistic revisions prevent two planners overwriting each other.

Resource availability and participant windows are explicit. A start and end date alone does not imply every participant is available. See progress and known issues for supported constraints and remaining calendar features.
