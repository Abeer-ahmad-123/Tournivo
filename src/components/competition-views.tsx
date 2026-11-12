"use client";
import { Trophy, Clock3, Check } from "lucide-react";
import type { Structure, Points } from "@/modules/tournaments/types";
import { getFormat } from "@/modules/tournaments/registry";
import { EmptyState } from "./ui/primitives";
import { initials } from "@/lib/utils";
export function BracketView({
  structure,
  onMatch,
}: {
  structure: Structure;
  onMatch?: (key: string) => void;
}) {
  if (structure.format === "double-elimination")
    return (
      <div className="bracket-sections">
        {[
          { stage: "winners", name: "Winners bracket" },
          { stage: "losers", name: "Lower bracket" },
          { stage: "finals", name: "Grand final & conditional reset" },
        ].map((section) => (
          <section key={section.stage}>
            <h3>{section.name}</h3>
            <BracketBoard
              structure={{
                ...structure,
                championId: section.stage === "finals" ? structure.championId : null,
                matches: structure.matches.filter((m) =>
                  section.stage === "finals"
                    ? m.stage.startsWith("grand-final")
                    : m.stage === section.stage,
                ),
              }}
              onMatch={onMatch}
            />
          </section>
        ))}
      </div>
    );
  if (structure.format === "group-stage-knockout")
    return (
      <div className="bracket-sections">
        {["group-A", "group-B"].map((group) => {
          const matches = structure.matches.filter((m) => m.stage === group),
            ids = new Set(matches.flatMap((m) => m.participants));
          return (
            <section key={group}>
              <h3>{group.replace("-", " ")}</h3>
              <StandingsView
                structure={{
                  ...structure,
                  format: "round-robin",
                  matches,
                  entrants: structure.entrants.filter((e) => ids.has(e.id)),
                }}
                points={{ win: 3, draw: 1, loss: 0 }}
              />
            </section>
          );
        })}
        <section>
          <h3>Knockout stage · top two from each group</h3>
          <BracketBoard
            structure={{
              ...structure,
              matches: structure.matches.filter((m) => m.stage === "knockout"),
            }}
            onMatch={onMatch}
          />
        </section>
      </div>
    );
  return <BracketBoard structure={structure} onMatch={onMatch} />;
}
function BracketBoard({
  structure,
  onMatch,
}: {
  structure: Structure;
  onMatch?: (key: string) => void;
}) {
  const rounds = [...new Set(structure.matches.map((m) => m.round))];
  return (
    <div className="bracket-scroll">
      <div className="bracket-board">
        {rounds.map((round, roundIndex) => (
          <div className="bracket-round" key={round}>
            <div className="bracket-round-title">
              <span>
                {roundIndex === rounds.length - 1
                  ? "Final"
                  : roundIndex === rounds.length - 2
                    ? "Semifinals"
                    : `Round ${roundIndex + 1}`}
              </span>
              <small>
                {structure.matches.filter((m) => m.round === round).length} match
                {structure.matches.filter((m) => m.round === round).length > 1 ? "es" : ""}
              </small>
            </div>
            <div className="bracket-round-matches">
              {structure.matches
                .filter((m) => m.round === round)
                .map((m) => (
                  <button
                    key={m.id}
                    className={`bracket-match ${m.status === "bye" ? "is-bye" : ""}`}
                    onClick={() => onMatch?.(m.id)}
                    disabled={!onMatch || m.status === "bye"}
                  >
                    <div className="bracket-match-label">
                      <span>{m.id.toUpperCase()}</span>
                      {m.status === "completed" ? (
                        <Check size={12} />
                      ) : m.status === "bye" ? (
                        "BYE"
                      ) : (
                        <Clock3 size={12} />
                      )}
                    </div>
                    {m.participants.map((id, i) => (
                      <div
                        key={i}
                        className={`bracket-entrant ${id && m.winnerId === id ? "winner" : ""}`}
                      >
                        <span className="bracket-team-avatar">
                          {id
                            ? initials(structure.entrants.find((e) => e.id === id)?.name ?? "?")
                            : "—"}
                        </span>
                        <strong>
                          {structure.entrants.find((e) => e.id === id)?.name ??
                            (m.status === "bye" ? "Bye" : "To be determined")}
                        </strong>
                        <span className="bracket-score">{m.scores?.[i] ?? "—"}</span>
                      </div>
                    ))}
                  </button>
                ))}
            </div>
          </div>
        ))}
        {structure.championId && (
          <div className="champion-card">
            <Trophy size={34} />
            <small>CHAMPION</small>
            <h3>{structure.entrants.find((e) => e.id === structure.championId)?.name}</h3>
            <p>A competition to remember.</p>
          </div>
        )}
      </div>
    </div>
  );
}
export function StandingsView({ structure, points }: { structure: Structure; points: Points }) {
  const format = getFormat(structure.format);
  if (!format.calculateStandings)
    return (
      <EmptyState
        icon={Trophy}
        title="The bracket tells the story."
        description="This format advances winners through the bracket. League standings do not apply."
      />
    );
  const standings = format.calculateStandings(structure, points);
  return (
    <>
      <div className="table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Entrant</th>
              <th>Played</th>
              <th>Won</th>
              <th>Drawn</th>
              <th>Lost</th>
              <th>For</th>
              <th>Against</th>
              <th>Diff</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.entrantId}>
                <td>
                  <span className={`rank ${row.rank <= 3 ? "rank-top" : ""}`}>{row.rank}</span>
                </td>
                <td>
                  <strong>{structure.entrants.find((e) => e.id === row.entrantId)?.name}</strong>
                </td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{row.for}</td>
                <td>{row.against}</td>
                <td>
                  {row.difference > 0 ? "+" : ""}
                  {row.difference}
                </td>
                <td>
                  <strong>{row.points}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="table-note">
        Win {points.win} · Draw {points.draw} · Loss {points.loss}. Tiebreakers: points, score
        difference, scores for. Remaining ties share rank.
      </p>
    </>
  );
}
