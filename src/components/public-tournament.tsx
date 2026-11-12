"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Download, Globe2, Trophy, Users } from "lucide-react";
import type { Jsonify, getPublicTournament } from "@/lib/queries";
import type { FormatId, Structure } from "@/modules/tournaments/types";
import { formatLibrary } from "@/modules/tournaments/registry";
import { dateLabel, title } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, StatusBadge, Tabs } from "./ui/primitives";
import { BracketView, StandingsView } from "./competition-views";
type PublicData = NonNullable<Jsonify<Awaited<ReturnType<typeof getPublicTournament>>>>;
export function PublicTournament({ data: d }: { data: PublicData }) {
  const [tab, setTab] = useState("fixtures");
  const t = d.tournament;
  const names = (id: string | null) =>
    d.entrants.find((p) => p.id === id)?.name ?? "To be determined";
  const structure: Structure = {
    format: t.format as FormatId,
    entrants: d.entrants,
    matches: d.matches.map((m) => ({
      id: m.key,
      round: m.round,
      position: m.position,
      stage: m.stage,
      sources: m.sources,
      participants: [m.participantA, m.participantB],
      status: m.status,
      scores: m.scores ?? undefined,
      winnerId: m.winnerId,
    })),
    championId: t.championId,
    revision: 0,
  };
  return (
    <div className="public-page">
      <nav className="public-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Trophy size={20} />
          </span>
          TOURNIVO<span className="brand-period">.</span>
        </Link>
        <Link href="/">
          Organize your own competition
          <ArrowUpRight size={15} />
        </Link>
      </nav>
      <header className="public-hero">
        <span className="section-kicker">THE STAGE IS SET</span>
        <h1>{t.name}</h1>
        <p>
          {t.description || "Follow every fixture, result and defining moment of the competition."}
        </p>
        <div className="public-meta">
          <span>
            <Trophy size={15} />
            {title(t.sportId ?? "Custom competition")}
          </span>
          <span>
            <Users size={15} />
            {d.entrants.length} entrants
          </span>
          <span>
            <Globe2 size={15} />
            {formatLibrary.find((f) => f.id === t.format)?.name}
          </span>
          <StatusBadge status={t.status} />
        </div>
      </header>
      <main className="public-content">
        {t.championId && (
          <div className="public-champion">
            <Trophy size={35} />
            <div>
              <small>YOUR CHAMPION</small>
              <h2>{names(t.championId)}</h2>
            </div>
          </div>
        )}
        <Tabs
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "fixtures", label: "Fixtures & results" },
            { value: "bracket", label: "Bracket" },
            { value: "standings", label: "Standings" },
            { value: "entrants", label: "Entrants" },
            { value: "rulebook", label: "Published rulebook" },
          ]}
        >
          <Card>
            <div className="card-heading">
              <div>
                <h2>
                  {tab === "fixtures"
                    ? "Every match. Every moment."
                    : tab === "bracket"
                      ? "The road to the title"
                      : tab === "standings"
                        ? "Competition standings"
                        : tab === "entrants"
                          ? "Meet the competition"
                          : "The rules of the competition"}
                </h2>
                <p>Official tournament information, shared by the organizer.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => window.print()}>
                <Download size={15} />
                Print / PDF
              </Button>
            </div>
            {tab === "fixtures" && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Match</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Schedule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.matches.map((m) => {
                      const booking = d.schedule.find((b) => b.matchKey === m.key);
                      return (
                        <tr key={m.key}>
                          <td>R{m.round}</td>
                          <td>
                            <strong>{names(m.participantA)}</strong>{" "}
                            <span className="muted">vs</span>{" "}
                            <strong>{m.status === "bye" ? "Bye" : names(m.participantB)}</strong>
                          </td>
                          <td>
                            <span className="score-display">
                              {m.scores?.join(" : ") ?? "— : —"}
                            </span>
                          </td>
                          <td>
                            <StatusBadge status={m.status} />
                          </td>
                          <td>
                            {booking ? (
                              <>
                                {dateLabel(booking.startsAt)}
                                <small className="block muted">{booking.venue}</small>
                              </>
                            ) : (
                              <span className="muted">Unscheduled</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "bracket" &&
              (["single-elimination", "double-elimination", "group-stage-knockout"].includes(
                t.format,
              ) ? (
                <BracketView structure={structure} />
              ) : (
                <EmptyState
                  icon={Trophy}
                  title="Follow the league standings."
                  description="League formats are decided through the ranking table."
                />
              ))}
            {tab === "standings" && <StandingsView structure={structure} points={d.points} />}
            {tab === "entrants" && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Seed</th>
                      <th>Entrant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.entrants.map((e) => (
                      <tr key={e.id}>
                        <td>#{e.seed}</td>
                        <td>
                          <strong>{e.name}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "rulebook" &&
              (d.rulebook ? (
                <div className="rulebook-content">
                  <Badge tone="blue">
                    Version {d.rulebook.version} · effective {dateLabel(d.rulebook.effectiveAt)}
                  </Badge>
                  {d.rulebook.rules.map((r) => (
                    <article className="published-rule" key={r.key}>
                      <div>
                        <Badge>{r.key}</Badge>
                        <span>{r.category}</span>
                      </div>
                      <h3>{r.title}</h3>
                      <p>{r.description}</p>
                      <dl className="rule-details">
                        <div>
                          <dt>Applies to</dt>
                          <dd>{title(r.entity)}</dd>
                        </div>
                        <div>
                          <dt>Violation</dt>
                          <dd>{r.conditions}</dd>
                        </div>
                        <div>
                          <dt>Penalty</dt>
                          <dd>{title(r.penalty)}</dd>
                        </div>
                        <div>
                          <dt>Evidence requirements</dt>
                          <dd>{r.evidence}</dd>
                        </div>
                        <div>
                          <dt>Escalation</dt>
                          <dd>
                            {r.escalation.length
                              ? r.escalation.map(title).join(" → ")
                              : "No automatic escalation"}
                          </dd>
                        </div>
                        <div>
                          <dt>Appeals</dt>
                          <dd>
                            {r.appealEligible
                              ? "Eligible, subject to the decision deadline"
                              : "Not eligible"}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Trophy}
                  title="No effective rulebook published yet."
                  description="The organizer will publish competition rules here."
                />
              ))}
          </Card>
        </Tabs>
      </main>
      <footer className="public-footer">
        Powered by Tournivo · Every Competition. Perfectly Organized.
      </footer>
    </div>
  );
}
