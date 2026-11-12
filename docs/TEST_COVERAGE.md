# Required scenario coverage

Automated tests validate the implemented core. This matrix distinguishes exercised behavior from remaining product scope; passing tests do not establish production readiness.

| Requested scenario                | Evidence and boundary                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8-team single elimination         | Unit assertions: 4 quarterfinals, 2 semifinals, 1 final; database generation; browser score and advancement                                       |
| 11-team single elimination        | Unit assertions: five byes, ten played matches, one champion                                                                                      |
| 16-team double elimination        | Unit full progression and randomized upsets, every non-champion loses twice; reset final; database full 30-match tournament                       |
| 8-team round robin                | Unit pair coverage, unique entrants within each round, 28 matches                                                                                 |
| 10-team double round robin        | Unit 90-match count and reversed home/away pair coverage                                                                                          |
| Groups followed by knockout       | Unit group and semifinal/final progression, deterministic seed tiebreak; database blocks group correction after a dependent semifinal result      |
| Odd participant counts            | Unit elimination, league and group progression over several odd sizes                                                                             |
| Withdrawal                        | Unit explicit forfeit; database retains entrant, registration and all fixtures                                                                    |
| Team disqualification             | Database confirmed published-policy case applies one penalty, changes eligibility and preserves team/history                                      |
| Player disqualification           | Database individual competition preserves the person. A player-specific target inside a team roster is not implemented and is explicitly rejected |
| Disqualification after completion | Pure policy test confirms past-results preservation. Full post-completion disciplinary integration coverage remains a gap                         |
| Appeal and reversal               | Database independent reviewer, safe restoration, immutable decision history, and blocked reversal after later results                             |
| Rulebook version change           | Database preserves prior rules and acknowledgement; database rejects rewriting a published rule                                                   |
| Duplicate match result            | Database exact replay, changed-payload rejection, concurrent submissions with one winner and one conflict                                         |
| Schedule conflicts                | Unit venue/participant overlap, rest, dependency, concurrency, availability, cycles; database shared venue protection across tournaments          |
| Unequal team sizes                | Unit no implicit catalog restrictions, optional equal-size enforcement and independent active-lineup checks                                       |
| Individual competitions           | Database generation, results, person/registration separation and disqualification                                                                 |
| Multi-stage competitions          | Fixed two-group → semifinal → final strategy exercised. Arbitrary stage composition remains unavailable                                           |

Additional tests cover anonymous access, untrusted mutation origins, tenant foreign-key mixing, role/match assignments, evidence signature and access validation, private storage round trips, safe public projections and atomic distributed rate counters. Browser assertions include a 390-pixel mobile viewport with no page-level horizontal overflow. A regression test proves that two failed generation attempts retain exactly one saved draft and advance its saved revision correctly.

Random-team coverage verifies exact once-only player assignment, balanced remainder handling, maximum team size, injected shuffle behavior, repeated names, existing-name collisions, invalid/tampered plans, read-only previews, exact saved rosters, idempotent saves, permissions and transaction rollback on stale names. Browser scenarios exercise preview/reshuffle/save/reload, mobile overflow, and using generated team rosters in the tournament wizard.

Tournament-deletion integration coverage exercises drafts, active and completed competitions, cross-tenant/role denial, assigned-admin authorization, exact-name confirmation, stale revision conflicts and idempotent retries. It verifies removal from workspace/public/detail/evidence access, blocking further edits, preservation of shared resources and immutable results/rules/decisions/acknowledgements, unlocked shared rosters and released venue capacity with historical bookings retained. Browser scenarios cover cancellation, confirmation gating, deletion/reload, public unavailability and mobile layout. Public unavailable pages can stream with HTTP 200 before `notFound()`; browser assertions check the unavailable UI and `noindex`, while private detail requests must return 404.

Run commands and environment requirements are in [README.md](../README.md). Test sources: [unit](../tests/unit/), [integration](../tests/integration/platform.test.ts), and [browser](../tests/e2e/lifecycle.spec.ts). The remote CI workflow is provided but has not run in this session.
