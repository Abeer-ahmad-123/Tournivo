# Tournament engine

Each strategy validates entrants/settings, generates a structure, advances results, and defines ties, byes and withdrawal behavior. Supported status is evidence-based and recorded in PROGRESS.md.

Single elimination pads seeds to the next power of two and resolves empty slots as byes, with exactly N−1 competitive matches. A bye is an advancement, not an invented played result. Seeding distributes byes. A final cannot complete until dependencies resolve. Draws are invalid in elimination. Corrections are rejected once downstream results exist.

Round robin uses circle rotation, adding a dummy for odd counts; each pair meets once per cycle. Alternating cycles reverse home/away. Standings use configured win/draw/loss points and deterministic published tiebreak ordering; unresolved competitive ties must remain visible rather than inventing qualification.

Double elimination maps winner-bracket losses into alternating lower-bracket consolidation/drop rounds, crossing drop positions to reduce immediate rematches. A winner-bracket champion who loses the grand final plays a reset; otherwise the reset resolves as an unplayed bye. Randomized upset tests assert that every non-champion has exactly two losses. Byes do not create a loss. Played match count is 2N−2 or 2N−1.

Group knockout supports exactly two seeded round-robin groups and two qualifiers each. A1 meets B2 and B1 meets A2. Group points are fixed 3/1/0; final qualification ties use initial seed. Qualifiers are frozen once assigned; subsequent withdrawals use the explicit future-forfeit policy. Corrections clear qualification slots only when no completed playoff depends on them. Too few eligible qualifiers require organizer resolution. Arbitrary multi-stage composition remains planned.

Other formats, including Swiss, remain unavailable until their strategies and edge cases are implemented and tested. Descriptions in the library distinguish supported strategies from planned entries.

Withdrawals and disqualification preserve registration and results. Future progression requires an explicit forfeit or standings policy. No UI controls calculate authoritative bracket outcomes.
