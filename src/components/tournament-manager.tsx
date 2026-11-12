"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Copy,
  Download,
  Flag,
  Globe2,
  Plus,
  Save,
  ShieldCheck,
  Swords,
  Trophy,
  Trash2,
  Users,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import type { Workspace, TournamentDetail } from "@/lib/queries";
import type { Command } from "@/lib/contracts";
import type { FormatId, Structure } from "@/modules/tournaments/types";
import { formatLibrary } from "@/modules/tournaments/registry";
import { dateLabel, title } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea,
} from "./ui/primitives";
import { CommandForm } from "./command-form";
import { BracketView, StandingsView } from "./competition-views";
import { RulebookBuilder } from "./rulebook-builder";
import { transitions } from "@/modules/discipline/workflow";

export function TournamentManager({
  tournament: t,
  workspace: w,
  send,
  onBack,
  onEdit,
}: {
  tournament: Workspace["tournaments"][number];
  workspace: Workspace;
  send: (c: Command) => Promise<Record<string, unknown>>;
  onBack: () => void;
  onEdit: () => void;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState(t.status === "draft" ? "overview" : "fixtures"),
    [detail, setDetail] = useState<TournamentDetail | null>(null),
    [detailError, setDetailError] = useState("");
  const [matchId, setMatchId] = useState<string | null>(null),
    [ruleBuilder, setRuleBuilder] = useState(false),
    [schedule, setSchedule] = useState(false),
    [report, setReport] = useState(false),
    [caseId, setCaseId] = useState<string | null>(null),
    [appealDecision, setAppealDecision] = useState<string | null>(null),
    [versionId, setVersionId] = useState<string | null>(null),
    [access, setAccess] = useState(false),
    [withdraw, setWithdraw] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null),
    [confirmationName, setConfirmationName] = useState(""),
    [deleteError, setDeleteError] = useState("");
  const loadDetail = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspace?tournamentId=${t.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDetail(data);
      setDetailError("");
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Unable to load tournament details.");
    }
  }, [t.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state changes follow the asynchronous detail fetch.
    void loadDetail();
  }, [loadDetail, t.revision]);
  const entrants = w.participants.filter((p) => p.tournamentId === t.id),
    matches = w.matches.filter((m) => m.tournamentId === t.id),
    bookings = w.schedules.filter((b) => b.tournamentId === t.id);
  const structure: Structure = {
    format: t.format as FormatId,
    entrants: entrants.map((p) => ({
      id: p.id,
      name: p.name,
      seed: p.seed,
      eligible: p.eligibility === "eligible",
    })),
    matches: matches.map((m) => ({
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
    revision: t.revision,
    championId: t.championId,
  };
  const assignedRole = w.assignments.find(
    (a) => a.userId === w.actorId && a.tournamentId === t.id,
  )?.role;
  const canManage =
      !!w.organization &&
      (["owner", "organizer"].includes(w.organization.role) || assignedRole === "admin"),
    scope = { organizationId: t.organizationId, tournamentId: t.id },
    revision = { expectedRevision: t.revision };
  const selectedMatch = matches.find((m) => m.id === matchId),
    selectedCase = detail?.cases.find((c) => c.id === caseId),
    rule = detail?.rules.find((r) => r.id === selectedCase?.ruleId),
    selectedDecision = detail?.decisions.find((d) => d.caseId === selectedCase?.id);
  const currentVersion = detail?.versions.find((v) => v.id === versionId) ?? detail?.versions[0];
  const currentRules = detail?.rules.filter((r) => r.versionId === currentVersion?.id) ?? [];
  async function act(command: Command, success: string) {
    setBusy(true);
    try {
      await send(command);
      await loadDetail();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to complete action.");
    } finally {
      setBusy(false);
    }
  }
  const names = (id: string | null) =>
    entrants.find((p) => p.id === id)?.name ?? "To be determined";
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        All tournaments
      </button>
      <div className="tournament-heading">
        <div className="tournament-title-icon">
          <Trophy size={31} />
        </div>
        <div>
          <div className="tournament-title-line">
            <h1>{t.name}</h1>
            <StatusBadge status={t.status} />
          </div>
          <p>
            {w.catalog.find((s) => s.id === t.sportId)?.name} <span>·</span>{" "}
            {formatLibrary.find((f) => f.id === t.format)?.name} <span>·</span>{" "}
            {entrants.length ||
              (Array.isArray(t.draft.entrantNames) ? t.draft.entrantNames.length : 0)}{" "}
            entrants
          </p>
        </div>
        <div className="tournament-heading-actions">
          {canManage && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setConfirmationName("");
                setDeleteError("");
                setDeleteKey(crypto.randomUUID());
              }}
            >
              <Trash2 size={15} />
              Delete tournament
            </Button>
          )}
          {canManage && (
            <Button variant="outline" onClick={() => setAccess(true)}>
              <Users size={15} />
              Manage access
            </Button>
          )}
          {t.status === "draft" && canManage ? (
            <Button onClick={onEdit}>
              Continue setup
              <ArrowUpRight size={16} />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => window.print()}>
                <Download size={16} />
                Print / save PDF
              </Button>
              {canManage && (
                <Button
                  variant={t.visibility === "public" ? "outline" : "default"}
                  loading={busy}
                  onClick={() =>
                    void act(
                      {
                        action: "tournament.publish",
                        ...scope,
                        ...revision,
                        visibility: t.visibility === "public" ? "private" : "public",
                      },
                      t.visibility === "public"
                        ? "Tournament is now private."
                        : "Tournament published.",
                    )
                  }
                >
                  <Globe2 size={16} />
                  {t.visibility === "public" ? "Make private" : "Publish tournament"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {t.visibility === "public" && t.status !== "draft" && (
        <div className="public-link-banner">
          <Globe2 size={16} />
          <span>This competition has a public home.</span>
          <a href={`/t/${t.slug}`} target="_blank" rel="noreferrer">
            View public page
            <ArrowUpRight size={14} />
          </a>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy public link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${location.origin}/t/${t.slug}`);
                toast.success("Public link copied.");
              } catch {
                toast.error("Unable to copy. Open the public page to share its URL.");
              }
            }}
          >
            <Copy size={15} />
          </Button>
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          ...(t.status === "draft" ? [{ value: "overview", label: "Overview" }] : []),
          { value: "fixtures", label: "Fixtures & results" },
          { value: "bracket", label: "Bracket" },
          { value: "standings", label: "Standings" },
          { value: "participants", label: "Participants" },
          { value: "schedule", label: "Schedule" },
          { value: "rulebook", label: "Rulebook" },
          { value: "discipline", label: "Disciplinary center" },
        ]}
      >
        {tab === "overview" && (
          <Card>
            <EmptyState
              icon={Flag}
              title="Your next competition is taking shape."
              description={
                t.description ||
                "Continue the eight-step setup to review and generate your fixtures."
              }
              action={
                <Button onClick={onEdit}>
                  Continue tournament setup
                  <ArrowUpRight size={16} />
                </Button>
              }
            />
          </Card>
        )}
        {tab === "fixtures" && (
          <Card>
            <div className="card-heading">
              <div>
                <h2>Fixtures & results</h2>
                <p>
                  {matches.filter((m) => m.status === "completed").length} completed ·{" "}
                  {matches.filter((m) => m.status === "ready").length} ready to play
                </p>
              </div>
              <Badge>{matches.filter((m) => m.status !== "bye").length} competitive matches</Badge>
            </div>
            {matches.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Match</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Schedule</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => {
                      const booking = bookings.find((b) => b.matchId === m.id);
                      return (
                        <tr key={m.id}>
                          <td>
                            <span className="round-label">R{m.round}</span>
                            <small className="block muted">{m.key.toUpperCase()}</small>
                          </td>
                          <td>
                            <div className="fixture-teams">
                              <strong>{names(m.participantA)}</strong>
                              <small>vs</small>
                              <strong>
                                {m.status === "bye" && !m.participantB
                                  ? "Bye"
                                  : names(m.participantB)}
                              </strong>
                            </div>
                          </td>
                          <td>
                            <span className="score-display">
                              {m.scores ? `${m.scores[0]} : ${m.scores[1]}` : "— : —"}
                            </span>
                          </td>
                          <td>
                            <StatusBadge status={m.status} />
                          </td>
                          <td>
                            {booking ? (
                              <>
                                <span>{dateLabel(booking.startsAt)}</span>
                                <small className="block muted">
                                  {w.venues.find((v) => v.id === booking.venueId)?.name}
                                </small>
                              </>
                            ) : (
                              <span className="muted">Unscheduled</span>
                            )}
                          </td>
                          <td>
                            {(canManage ||
                              (assignedRole === "referee" &&
                                m.refereeId === w.actorId &&
                                m.status === "ready")) &&
                              ["ready", "completed"].includes(m.status) && (
                                <Button variant="ghost" size="sm" onClick={() => setMatchId(m.id)}>
                                  {m.status === "completed" ? "Correct result" : "Enter result"}
                                  <ArrowUpRight size={13} />
                                </Button>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Swords}
                title="Fixtures are on their way."
                description="Finish tournament setup to generate real matches."
                action={canManage ? <Button onClick={onEdit}>Continue setup</Button> : undefined}
              />
            )}
          </Card>
        )}
        {tab === "bracket" && (
          <Card className="bracket-card">
            <div className="card-heading">
              <div>
                <h2>The road to the title</h2>
                <p>Every result moves the competition forward.</p>
              </div>
            </div>
            {["single-elimination", "double-elimination", "group-stage-knockout"].includes(
              t.format,
            ) && matches.length ? (
              <BracketView
                structure={structure}
                onMatch={(key) => {
                  const match = matches.find((m) => m.key === key);
                  if (canManage && match && ["ready", "completed"].includes(match.status))
                    setMatchId(match.id);
                }}
              />
            ) : (
              <EmptyState
                icon={Swords}
                title={
                  matches.length
                    ? "A league is decided in the standings."
                    : "The bracket is waiting."
                }
                description={
                  matches.length
                    ? "Open Fixtures & results to follow every matchup, or Standings to see the rankings."
                    : "Generate this tournament to see the bracket."
                }
              />
            )}
          </Card>
        )}
        {tab === "standings" && (
          <Card>
            <div className="card-heading">
              <div>
                <h2>Standings</h2>
                <p>Calculated from confirmed results and your scoring policy.</p>
              </div>
            </div>
            {matches.length ? (
              <StandingsView
                structure={structure}
                points={
                  (t.config.points as { win: number; draw: number; loss: number }) ?? {
                    win: 3,
                    draw: 1,
                    loss: 0,
                  }
                }
              />
            ) : (
              <EmptyState
                icon={Trophy}
                title="The table is yet to be written."
                description="Generate fixtures and record results to calculate standings."
              />
            )}
          </Card>
        )}
        {tab === "participants" && (
          <Card>
            <div className="card-heading">
              <div>
                <h2>Registered entrants</h2>
                <p>Eligibility changes preserve registrations and historical results.</p>
              </div>
            </div>
            {entrants.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Seed</th>
                      <th>Entrant</th>
                      <th>Structure</th>
                      <th>Eligibility</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {entrants.map((p) => (
                      <tr key={p.id}>
                        <td>#{p.seed}</td>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>{p.teamId ? "Team" : "Individual"}</td>
                        <td>
                          <StatusBadge status={p.eligibility} />
                        </td>
                        <td>
                          {canManage && p.playerId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const email = window.prompt(
                                  "Enter the existing workspace member’s account email.",
                                );
                                if (email)
                                  void act(
                                    {
                                      action: "participant.link-user",
                                      ...scope,
                                      participantId: p.id,
                                      email,
                                    },
                                    "Participant account linked.",
                                  );
                              }}
                            >
                              Link account
                            </Button>
                          )}
                          {canManage && p.eligibility === "eligible" && (
                            <Button variant="ghost" size="sm" onClick={() => setWithdraw(p.id)}>
                              Withdraw
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="Your entrants are in the draft."
                description="They become tournament registrations when you generate fixtures."
              />
            )}
          </Card>
        )}
        {tab === "schedule" && (
          <Card>
            <div className="card-heading">
              <div>
                <h2>Match schedule</h2>
                <p>
                  Times below use {String(t.config.timezone ?? "UTC")}. Dependencies, venue capacity
                  and rest are checked.
                </p>
              </div>
              {canManage && matches.length > 0 && (
                <Button onClick={() => setSchedule(true)}>
                  <CalendarDays size={16} />
                  {bookings.length ? "Regenerate schedule" : "Generate schedule"}
                </Button>
              )}
            </div>
            {bookings.length ? (
              <div className="schedule-list">
                {bookings.map((b) => {
                  const m = matches.find((m) => m.id === b.matchId)!;
                  return (
                    <div className="schedule-item" key={b.id}>
                      <span className="schedule-date">
                        <strong>
                          {dateLabel(b.startsAt, {
                            day: "numeric",
                            timeZone: String(t.config.timezone ?? "UTC"),
                          })}
                        </strong>
                        {dateLabel(b.startsAt, {
                          month: "short",
                          timeZone: String(t.config.timezone ?? "UTC"),
                        })}
                      </span>
                      <div>
                        <strong>
                          {names(m.participantA)} <small className="muted">vs</small>{" "}
                          {names(m.participantB)}
                        </strong>
                        <p>
                          <MapPin size={13} />
                          {w.venues.find((v) => v.id === b.venueId)?.name} ·{" "}
                          {dateLabel(b.startsAt, {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: String(t.config.timezone ?? "UTC"),
                          })}{" "}
                          –{" "}
                          {dateLabel(b.endsAt, {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: String(t.config.timezone ?? "UTC"),
                          })}
                        </p>
                      </div>
                      <Badge tone="green">Constraint checked</Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Every match needs its moment."
                description="Add resources and availability in Scheduling, then generate a checked schedule here."
              />
            )}
          </Card>
        )}
        {tab === "rulebook" && (
          <Card>
            <div className="card-heading">
              <div>
                <h2>Competition rulebook</h2>
                <p>Conduct and eligibility rules, independently versioned.</p>
              </div>
              {canManage && detail && (
                <Button onClick={() => setRuleBuilder(true)}>
                  <Plus size={16} />
                  {detail.versions.length ? "Publish new version" : "Build rulebook"}
                </Button>
              )}
            </div>
            {detailError ? (
              <div className="error-banner">{detailError}</div>
            ) : !detail ? (
              <div className="dialog-body">
                <Skeleton className="h-40" />
              </div>
            ) : detail.versions.length ? (
              <div className="rulebook-content">
                <div className="rulebook-controls">
                  <Select
                    aria-label="Rulebook version"
                    value={currentVersion?.id}
                    onChange={(e) => setVersionId(e.target.value)}
                  >
                    {detail.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.version} · effective {dateLabel(v.effectiveAt)}
                      </option>
                    ))}
                  </Select>
                  {detail.acknowledgements.some((a) => a.versionId === currentVersion?.id) ? (
                    <Badge tone="green">
                      <Check size={13} />
                      Acknowledged
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      loading={busy}
                      onClick={() =>
                        void act(
                          {
                            action: "rulebook.acknowledge",
                            ...scope,
                            versionId: currentVersion!.id,
                          },
                          "Rulebook version acknowledged.",
                        )
                      }
                    >
                      Acknowledge version {currentVersion?.version}
                    </Button>
                  )}
                </div>
                {currentRules.map((r) => (
                  <article className="published-rule" key={r.id}>
                    <div>
                      <Badge tone="blue">{r.key}</Badge>
                      <Badge
                        tone={
                          r.severity === "critical" || r.severity === "high" ? "red" : "neutral"
                        }
                      >
                        {r.severity}
                      </Badge>
                      <span className="muted">{r.category}</span>
                    </div>
                    <h3>{r.title}</h3>
                    <p>{r.description}</p>
                    <dl className="rule-details">
                      <div>
                        <dt>Applies to</dt>
                        <dd>{title(r.entity)}</dd>
                      </div>
                      <div>
                        <dt>Violation conditions</dt>
                        <dd>{r.conditions}</dd>
                      </div>
                      <div>
                        <dt>Penalty</dt>
                        <dd>{title(r.penalty)}</dd>
                      </div>
                      <div>
                        <dt>Evidence required</dt>
                        <dd>{r.evidence}</dd>
                      </div>
                      <div>
                        <dt>Repeat violations</dt>
                        <dd>
                          {r.escalation.length
                            ? r.escalation.map(title).join(" → ")
                            : "No escalation configured"}
                        </dd>
                      </div>
                      <div>
                        <dt>Appeals</dt>
                        <dd>
                          {r.appealEligible
                            ? "Eligible, subject to decision deadline"
                            : "Not eligible"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BookOpen}
                title="Clear rules. Better competition."
                description="Create a versioned rulebook for conduct, eligibility, penalties and appeals. It stays independent from match settings."
                action={
                  canManage ? (
                    <Button variant="outline" onClick={() => setRuleBuilder(true)}>
                      Open rulebook builder
                      <ArrowUpRight size={15} />
                    </Button>
                  ) : undefined
                }
              />
            )}
          </Card>
        )}
        {tab === "discipline" && (
          <>
            <Card>
              <div className="card-heading">
                <div>
                  <h2>Disciplinary cases</h2>
                  <p>Evidence, review and decisions with a complete audit trail.</p>
                </div>
                {canManage && (
                  <Button
                    onClick={() => setReport(true)}
                    disabled={!detail?.rules.length || !entrants.length}
                  >
                    <Plus size={16} />
                    Report a violation
                  </Button>
                )}
              </div>
              {detail?.cases.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Affected entrant</th>
                        <th>Status</th>
                        <th>Reported</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.cases.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.title}</strong>
                          </td>
                          <td>{names(c.participantId)}</td>
                          <td>
                            <StatusBadge status={c.status} />
                          </td>
                          <td>{dateLabel(c.createdAt)}</td>
                          <td>
                            <Button variant="ghost" size="sm" onClick={() => setCaseId(c.id)}>
                              Review
                              <ArrowUpRight size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="Keep the competition fair."
                  description="Publish a rulebook and register participants to report a violation. Private evidence is visible only to authorized reviewers and affected participants."
                />
              )}
            </Card>
            {!!detail?.appeals.length && (
              <Card className="section-card">
                <div className="card-heading">
                  <div>
                    <h2>Appeals</h2>
                    <p>
                      An independent reviewer is required. Unsafe bracket reversals are blocked.
                    </p>
                  </div>
                </div>
                {detail.appeals.map((a) => (
                  <div className="appeal-row" key={a.id}>
                    <div>
                      <Badge>{a.status}</Badge>
                      <p>{a.reason}</p>
                      {a.explanation && <small>{a.explanation}</small>}
                    </div>
                    {a.status === "submitted" && canManage && (
                      <div>
                        <Button
                          variant="outline"
                          loading={busy}
                          onClick={() => {
                            const explanation = window.prompt(
                              "Explain why this appeal is rejected (at least 10 characters).",
                            );
                            if (explanation)
                              void act(
                                {
                                  action: "appeal.decide",
                                  ...scope,
                                  ...revision,
                                  idempotencyKey: crypto.randomUUID(),
                                  appealId: a.id,
                                  approved: false,
                                  explanation,
                                },
                                "Appeal rejected with explanation.",
                              );
                          }}
                        >
                          Reject
                        </Button>
                        <Button
                          loading={busy}
                          onClick={() => {
                            const explanation = window.prompt(
                              "Explain the reversal (at least 10 characters).",
                            );
                            if (explanation)
                              void act(
                                {
                                  action: "appeal.decide",
                                  ...scope,
                                  ...revision,
                                  idempotencyKey: crypto.randomUUID(),
                                  appealId: a.id,
                                  approved: true,
                                  explanation,
                                },
                                "Appeal approved and safe state restored.",
                              );
                          }}
                        >
                          Approve reversal
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </>
        )}
      </Tabs>
      <Dialog
        open={access}
        onOpenChange={setAccess}
        title="Tournament access"
        description="Organization membership is required. Referees can submit only assigned matches."
      >
        <CommandForm
          onSubmit={async (data) => {
            await send({
              action: "tournament.assign",
              ...scope,
              userId: String(data.get("userId")),
              role: String(data.get("role")) as "admin",
            });
            toast.success("Tournament assignment saved.");
          }}
        >
          <Field label="Workspace member">
            <Select name="userId">
              {w.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tournament role">
            <Select name="role">
              {["admin", "referee", "manager", "player", "spectator"].map((r) => (
                <option key={r} value={r}>
                  {title(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Assign tournament role</Button>
        </CommandForm>
        {matches.length > 0 && (
          <CommandForm
            onSubmit={async (data) => {
              await send({
                action: "match.assign",
                ...scope,
                userId: String(data.get("referee")),
                matchId: String(data.get("match")),
              });
              toast.success("Referee assigned to match.");
            }}
          >
            <Field label="Match">
              <Select name="match">
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.key} — {names(m.participantA)} vs {names(m.participantB)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned tournament referee">
              <Select name="referee">
                {w.assignments
                  .filter((a) => a.tournamentId === t.id && a.role === "referee")
                  .map((a) => (
                    <option key={a.id} value={a.userId}>
                      {w.members.find((m) => m.id === a.userId)?.name ?? a.userId}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button type="submit">Assign match</Button>
          </CommandForm>
        )}
      </Dialog>
      <Dialog
        open={!!withdraw}
        onOpenChange={(open) => !open && setWithdraw(null)}
        title="Withdraw an entrant"
        description="The entrant and past results stay in the tournament history."
      >
        <CommandForm
          onSubmit={async (data) => {
            await send({
              action: "participant.withdraw",
              ...scope,
              ...revision,
              participantId: withdraw!,
              policy: "preserve-results-forfeit-future",
              reason: String(data.get("reason")),
              idempotencyKey: crypto.randomUUID(),
            });
            setWithdraw(null);
            toast.success("Entrant withdrawn; eligible opponents receive future forfeits.");
          }}
        >
          <div className="info-banner">
            <Flag size={20} />
            <p>
              Explicit policy: preserve completed results and award future opponents a 1–0 forfeit.
              If both entrants are ineligible, the action is blocked for organizer resolution.
            </p>
          </div>
          <Field label="Reason for withdrawal">
            <Textarea name="reason" minLength={10} required />
          </Field>
          <Button type="submit">Confirm withdrawal</Button>
        </CommandForm>
      </Dialog>
      {ruleBuilder && detail && (
        <RulebookBuilder
          tournament={t}
          detail={detail}
          send={async (c) => {
            const result = await send(c);
            await loadDetail();
            return result;
          }}
          onClose={() => setRuleBuilder(false)}
        />
      )}
      <Dialog
        open={!!selectedMatch}
        onOpenChange={(open) => !open && setMatchId(null)}
        title={selectedMatch?.status === "completed" ? "Correct a result" : "Record a result"}
        description={
          selectedMatch
            ? `${names(selectedMatch.participantA)} vs ${names(selectedMatch.participantB)}`
            : undefined
        }
      >
        <CommandForm
          onSubmit={async (data) => {
            const scores: [number, number] = [Number(data.get("a")), Number(data.get("b"))];
            if (selectedMatch!.status === "completed")
              await send({
                action: "match.correct",
                ...scope,
                ...revision,
                idempotencyKey: crypto.randomUUID(),
                matchId: selectedMatch!.id,
                scores,
                reason: String(data.get("reason")),
              });
            else
              await send({
                action: "match.result",
                ...scope,
                ...revision,
                idempotencyKey: crypto.randomUUID(),
                matchId: selectedMatch!.id,
                scores,
              });
            setMatchId(null);
            toast.success("Result recorded and progression updated.");
          }}
        >
          <div className="form-grid">
            <Field label={selectedMatch ? names(selectedMatch.participantA) : "Entrant A"}>
              <Input
                name="a"
                type="number"
                min={0}
                max={100000}
                required
                defaultValue={selectedMatch?.scores?.[0] ?? 0}
              />
            </Field>
            <Field label={selectedMatch ? names(selectedMatch.participantB) : "Entrant B"}>
              <Input
                name="b"
                type="number"
                min={0}
                max={100000}
                required
                defaultValue={selectedMatch?.scores?.[1] ?? 0}
              />
            </Field>
          </div>
          {selectedMatch?.status === "completed" && (
            <Field
              label="Reason for correction"
              hint="Recorded in audit history. Corrections with completed downstream dependencies are blocked."
            >
              <Textarea name="reason" minLength={10} required />
            </Field>
          )}
          <Button type="submit">
            <Save size={16} />
            Confirm result
          </Button>
        </CommandForm>
      </Dialog>
      <Dialog
        open={schedule}
        onOpenChange={setSchedule}
        title="Generate a checked schedule"
        description="Possible bracket entrants are included in conflict checks. Generate before the first result; automatic rescheduling is locked after play begins."
      >
        <CommandForm
          onSubmit={async (data) => {
            await send({
              action: "schedule.generate",
              ...scope,
              ...revision,
              idempotencyKey: crypto.randomUUID(),
              venueIds: data.getAll("venue").map(String),
              maxConcurrent: Number(data.get("concurrent")),
            });
            setSchedule(false);
            toast.success("Schedule generated and constraints checked.");
          }}
        >
          <div>
            <h4>Available resources</h4>
            {w.venues.map((v) => (
              <label className="checkbox-row resource-check" key={v.id}>
                <input name="venue" type="checkbox" value={v.id} defaultChecked />
                <span>
                  <strong>{v.name}</strong>
                  <small>
                    {v.availability.length} availability windows · {v.timezone}
                  </small>
                </span>
              </label>
            ))}
            {!w.venues.length && (
              <p className="error-banner">Add a venue or server in Scheduling first.</p>
            )}
          </div>
          <Field label="Maximum simultaneous matches">
            <Input
              name="concurrent"
              type="number"
              min={1}
              max={20}
              defaultValue={Math.max(1, w.venues.length)}
              required
            />
          </Field>
          <p className="field-hint">
            {String(t.config.durationMinutes)} minute matches · {String(t.config.restMinutes)}{" "}
            minute rest. Existing bookings in other tournaments reserve these resources.
          </p>
          <Button type="submit" disabled={!w.venues.length}>
            <CalendarDays size={16} />
            Generate schedule
          </Button>
        </CommandForm>
      </Dialog>
      <Dialog
        open={report}
        onOpenChange={setReport}
        title="Report a violation"
        description="A case starts a review. No penalty is applied automatically."
      >
        <CommandForm
          onSubmit={async (data) => {
            await send({
              action: "case.report",
              ...scope,
              participantId: String(data.get("participant")),
              ruleId: String(data.get("rule")),
              title: String(data.get("title")),
              description: String(data.get("description")),
            });
            await loadDetail();
            setReport(false);
            toast.success("Violation reported for review.");
          }}
        >
          <Field label="Case title">
            <Input name="title" minLength={2} required />
          </Field>
          <Field label="Affected entrant">
            <Select name="participant">
              {entrants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Published rule">
            <Select name="rule">
              {detail?.rules
                .filter(
                  (r) =>
                    r.versionId ===
                    detail.versions.find((v) => new Date(v.effectiveAt) <= new Date())?.id,
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.key} — {r.title}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Report details">
            <Textarea name="description" rows={4} minLength={10} required />
          </Field>
          <div className="info-banner">
            <ShieldCheck size={18} />
            <p>
              After submitting, open the case to attach private evidence when storage is configured.
              Files never appear on public tournament pages.
            </p>
          </div>
          <Button type="submit">
            <Flag size={16} />
            Submit report
          </Button>
        </CommandForm>
      </Dialog>
      <Dialog
        open={!!selectedCase}
        onOpenChange={(open) => !open && setCaseId(null)}
        title={selectedCase?.title ?? "Review case"}
        description={
          selectedCase ? `Affected entrant: ${names(selectedCase.participantId)}` : undefined
        }
      >
        <div className="dialog-body case-detail">
          <StatusBadge status={selectedCase?.status ?? "submitted"} />
          <p>{selectedCase?.description}</p>
          <h4>
            {rule?.key}: {rule?.title}
          </h4>
          <p className="muted">{rule?.conditions}</p>
          {selectedDecision && (
            <div className="info-banner">
              <ShieldCheck size={20} />
              <div>
                <strong>{title(selectedDecision.penalty)}</strong>
                <p>{selectedDecision.explanation}</p>
                <small>
                  {selectedDecision.appealDeadline
                    ? `Appeal before ${dateLabel(selectedDecision.appealDeadline)}`
                    : "No appeal window configured"}
                </small>
              </div>
            </div>
          )}
          <div className="case-actions">
            {canManage &&
              selectedCase &&
              (transitions[selectedCase.status] ?? [])
                .filter((status) =>
                  [
                    "under_review",
                    "awaiting_response",
                    "evidence_requested",
                    "decision_pending",
                    "dismissed",
                    "closed",
                  ].includes(status),
                )
                .map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    loading={busy}
                    onClick={() =>
                      void act(
                        {
                          action: "case.transition",
                          ...scope,
                          ...revision,
                          caseId: selectedCase.id,
                          status: status as "under_review",
                        },
                        `Case moved to ${title(status)}.`,
                      )
                    }
                  >
                    {title(status)}
                  </Button>
                ))}
            {selectedDecision?.appealDeadline && selectedCase?.status === "confirmed" && (
              <Button variant="outline" onClick={() => setAppealDecision(selectedDecision.id)}>
                Submit appeal
              </Button>
            )}
          </div>
        </div>
        {selectedCase && (
          <div className="dialog-body evidence-panel">
            <h4>Private evidence</h4>
            {detail?.evidence
              .filter((e) => e.caseId === selectedCase.id)
              .map((e) => (
                <a
                  className="evidence-file"
                  key={e.id}
                  href={`/api/evidence?id=${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={15} />
                  <span>
                    {e.mimeType} · {Math.ceil(e.size / 1024)} KB
                  </span>
                  <ArrowUpRight size={13} />
                </a>
              ))}
            {detail?.evidenceConfigured ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  data.set("caseId", selectedCase.id);
                  setBusy(true);
                  try {
                    const response = await fetch("/api/evidence", { method: "POST", body: data });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error);
                    await loadDetail();
                    form.reset();
                    toast.success("Evidence attached privately.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Upload failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field label="Attach evidence" hint="PNG, JPEG, WebP, PDF or MP4. Maximum 10 MB.">
                  <Input
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4"
                    required
                  />
                </Field>
                <Button type="submit" variant="outline" loading={busy}>
                  Upload private evidence
                </Button>
              </form>
            ) : (
              <p className="field-hint">
                Private storage is not configured. Uploads are unavailable.
              </p>
            )}
            {selectedCase.response && (
              <div className="info-banner">
                <div>
                  <strong>Participant response</strong>
                  <p>{selectedCase.response}</p>
                </div>
              </div>
            )}
          </div>
        )}
        {selectedCase &&
          !canManage &&
          ["awaiting_response", "evidence_requested"].includes(selectedCase.status) && (
            <CommandForm
              onSubmit={async (data) => {
                await send({
                  action: "case.respond",
                  ...scope,
                  caseId: selectedCase.id,
                  response: String(data.get("response")),
                });
                await loadDetail();
                toast.success("Response submitted for review.");
              }}
            >
              <Field label="Your response">
                <Textarea name="response" minLength={10} required />
              </Field>
              <Button type="submit">Submit response</Button>
            </CommandForm>
          )}
        {canManage && selectedCase?.status === "decision_pending" && (
          <CommandForm
            onSubmit={async (data) => {
              await send({
                action: "case.decide",
                ...scope,
                ...revision,
                idempotencyKey: crypto.randomUUID(),
                caseId: selectedCase.id,
                explanation: String(data.get("explanation")),
                penalty: String(data.get("penalty")) as "warning",
                policy: data.get("policy") === "on" ? "preserve-results-forfeit-future" : "none",
                appealDeadline: data.get("deadline")
                  ? new Date(`${data.get("deadline")}Z`).toISOString()
                  : undefined,
              });
              await loadDetail();
              toast.success("Decision applied once and recorded.");
            }}
          >
            <Field label="Penalty from published policy">
              <Select name="penalty">
                {[...new Set([rule?.penalty, ...(rule?.escalation ?? [])])]
                  .filter(Boolean)
                  .map((p) => (
                    <option key={p} value={p}>
                      {title(p!)}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Decision explanation">
              <Textarea name="explanation" minLength={10} required />
            </Field>
            <Field label="Appeal deadline (UTC, optional)">
              <Input name="deadline" type="datetime-local" disabled={!rule?.appealEligible} />
            </Field>
            <label className="checkbox-row">
              <input name="policy" type="checkbox" />I explicitly confirm: preserve past results and
              forfeit future matches 1–0 for ineligible entrants.
            </label>
            <Button type="submit">
              <ShieldCheck size={16} />
              Apply decision
            </Button>
          </CommandForm>
        )}
      </Dialog>
      <Dialog
        open={!!deleteKey}
        onOpenChange={(open) => !open && !busy && setDeleteKey(null)}
        title="Delete tournament"
        description="Remove this tournament, its fixtures and registrations from your workspace and public pages. Shared teams and players stay available. Published results and disciplinary history are retained. There is no restore option."
      >
        <form
          className="command-form"
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !deleteKey || confirmationName.trim() !== t.name) return;
            setBusy(true);
            setDeleteError("");
            try {
              await send({
                action: "tournament.delete",
                ...scope,
                ...revision,
                confirmationName,
                idempotencyKey: deleteKey,
              });
              onBack();
              toast.success("Tournament deleted.");
            } catch (e) {
              setDeleteError(e instanceof Error ? e.message : "Unable to delete tournament.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Tournament name to confirm" hint={`Type ${t.name} to confirm deletion.`}>
            <Input
              value={confirmationName}
              onChange={(event) => setConfirmationName(event.target.value)}
              disabled={busy}
              autoComplete="off"
              required
            />
          </Field>
          {deleteError && (
            <p role="alert" className="field-error">
              {deleteError}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setDeleteKey(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={busy}
              disabled={confirmationName.trim() !== t.name}
            >
              Delete tournament
            </Button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={!!appealDecision}
        onOpenChange={(open) => !open && setAppealDecision(null)}
        title="Submit an appeal"
        description="The original decision is preserved. An independent reviewer must decide any reversal."
      >
        <CommandForm
          onSubmit={async (data) => {
            await send({
              action: "appeal.submit",
              ...scope,
              decisionId: appealDecision!,
              reason: String(data.get("reason")),
            });
            await loadDetail();
            setAppealDecision(null);
            toast.success("Appeal submitted.");
          }}
        >
          <Field label="Reason for appeal">
            <Textarea name="reason" rows={5} minLength={10} required />
          </Field>
          <Button type="submit">Submit appeal</Button>
        </CommandForm>
      </Dialog>
    </>
  );
}
