"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Trophy,
  LayoutDashboard,
  Users,
  CalendarDays,
  BookOpen,
  ShieldCheck,
  Activity,
  Settings,
  Search,
  Bell,
  Plus,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  MoreHorizontal,
  Globe2,
  Gamepad2,
  LogOut,
  Moon,
  Sun,
  Menu,
  Building2,
  Flag,
  CheckCircle2,
  Swords,
  MapPin,
  Info,
  ChevronRight,
  AlertCircle,
  Shuffle,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { Workspace } from "@/lib/queries";
import type { Command } from "@/lib/contracts";
import { dateLabel, initials, title } from "@/lib/utils";
import { AuthScreen } from "./auth-screen";
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
  Tooltip,
} from "./ui/primitives";
import { TournamentWizard } from "./tournament-wizard";
import { CommandForm } from "./command-form";
import { TournamentManager } from "./tournament-manager";
import { formatLibrary } from "@/modules/tournaments/registry";
import { RandomTeamGenerator } from "./random-team-generator";

const navigation = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "tournaments", label: "Tournaments", icon: Trophy },
  { id: "teams", label: "Teams & players", icon: Users },
  { id: "scheduling", label: "Scheduling", icon: CalendarDays },
  { id: "rulebooks", label: "Rulebooks", icon: BookOpen },
  { id: "discipline", label: "Disciplinary center", icon: ShieldCheck },
  { id: "catalog", label: "Sports & games", icon: Gamepad2 },
  { id: "formats", label: "Format library", icon: Swords },
  { id: "activity", label: "Activity log", icon: Activity },
];
export async function sendCommand(command: Command): Promise<Record<string, unknown>> {
  const response = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Unable to complete request.");
  return data;
}
type Modal = "organization" | "team" | "random-teams" | "venue" | "member" | "notifications" | null;
export function WorkspaceApp() {
  const session = authClient.useSession(),
    { resolvedTheme, setTheme } = useTheme();
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [orgId, setOrgId] = useState<string>();
  const [page, setPage] = useState("dashboard"),
    [search, setSearch] = useState(""),
    [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null),
    [wizard, setWizard] = useState<"new" | string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [statusFilter, setStatusFilter] = useState("all");
  const [rosterTeam, setRosterTeam] = useState<string | null>(null),
    [infoFormat, setInfoFormat] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/workspace${orgId ? `?organizationId=${orgId}` : ""}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setWorkspace(data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
    }
  }, [orgId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh sets state only after its asynchronous network request.
    if (session.data) void refresh();
  }, [session.data, refresh]);
  function navigate(id: string) {
    setPage(id);
    setSelected(null);
    setSearch("");
    setSidebarOpen(false);
  }
  const org = workspace?.organization;
  const canManage = org && ["owner", "organizer", "admin"].includes(org.role);
  async function run(command: Command) {
    const result = await sendCommand(command);
    await refresh();
    return result;
  }
  const openTournament = (id: string) => {
    setSelected(id);
    setPage("tournaments");
  };
  const startWizard = () => (org ? setWizard("new") : setModal("organization"));
  if (session.isPending)
    return (
      <main className="app-loading">
        <div className="brand-mark">
          <Trophy size={24} />
        </div>
        <p>Opening your workspace…</p>
      </main>
    );
  if (!session.data) return <AuthScreen onSuccess={() => void session.refetch()} />;
  const user = session.data.user;
  const tournaments = (workspace?.tournaments ?? []).filter(
    (t) =>
      (!search || `${t.name} ${t.sportId}`.toLowerCase().includes(search.toLowerCase())) &&
      (statusFilter === "all" || t.status === statusFilter),
  );
  const active = workspace?.tournaments.filter((t) => t.status === "active") ?? [];
  const completedMatches = workspace?.matches.filter((m) => m.status === "completed") ?? [];
  const competitiveMatches = workspace?.matches.filter((m) => m.status !== "bye") ?? [];
  const pendingCases =
    workspace?.cases.filter(
      (c) => !["dismissed", "closed", "appeal_approved", "appeal_rejected"].includes(c.status),
    ) ?? [];
  const selectedTournament = workspace?.tournaments.find((t) => t.id === selected);
  const upcoming =
    workspace?.schedules.filter((s) => new Date(s.endsAt) >= new Date()).slice(0, 5) ?? [];
  const info = formatLibrary.find((f) => f.id === infoFormat);
  const greeting = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date());
  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Trophy size={21} />
          </span>
          TOURNIVO<span className="brand-period">.</span>
        </Link>
        <button className="org-selector" onClick={() => setModal("organization")}>
          <span className="org-avatar">
            <Building2 size={19} />
          </span>
          <span>
            <strong>{org?.name ?? "Your workspace"}</strong>
            <small>{org ? title(org.role) : "Create an organization"}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        {workspace && workspace.organizations.length > 1 && (
          <Select
            aria-label="Switch organization"
            value={org?.id}
            onChange={(e) => {
              setWorkspace(null);
              setOrgId(e.target.value);
              setSelected(null);
            }}
          >
            {workspace.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        )}
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.slice(0, 6).map((item) => (
            <button
              className={page === item.id ? "active" : ""}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "tournaments" && !!active.length && (
                <small className="nav-count">{active.length}</small>
              )}
              {item.id === "discipline" && !!pendingCases.length && <span className="nav-dot" />}
            </button>
          ))}
          <span className="nav-label">RESOURCES</span>
          {navigation.slice(6).map((item) => (
            <button
              className={page === item.id ? "active" : ""}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-callout">
            <span className="sidebar-callout-icon">
              <Flag size={19} />
            </span>
            <strong>Make the next one count.</strong>
            <p>Big ambitions. Better competitions.</p>
            <button onClick={startWizard}>
              Create a tournament <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`settings-nav ${page === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings size={19} />
            Settings
          </button>
          <div className="sidebar-profile">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <Tooltip label="Sign out">
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  await authClient.signOut();
                  setWorkspace(null);
                }}
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </Button>
            </Tooltip>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </Button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {selectedTournament?.name ??
                navigation.find((n) => n.id === page)?.label ??
                "Settings"}
            </strong>
          </div>
          <div className="topbar-actions">
            <div className="header-search">
              <Search size={16} />
              <input
                aria-label="Search workspace"
                placeholder="Search tournaments…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage("tournaments");
                  setSelected(null);
                }}
              />
              <kbd>⌕</kbd>
            </div>
            <Tooltip label="Switch theme">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                aria-label="Switch theme"
              >
                {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              className="notification-button"
              aria-label="Notifications"
              onClick={() => setModal("notifications")}
            >
              <Bell size={19} />
              {workspace?.notifications.some((n) => !n.readAt) && <i />}
            </Button>
            <span className="topbar-divider" />
            <span className="avatar small">{initials(user.name)}</span>
          </div>
        </header>
        <main className="workspace-content" id="main-content">
          {error ? (
            <Card className="error-state">
              <AlertCircle size={28} />
              <h2>We couldn’t load your workspace.</h2>
              <p>{error}</p>
              <Button onClick={refresh}>Try again</Button>
            </Card>
          ) : !workspace ? (
            <>
              <Skeleton className="h-14 w-80" />
              <div className="stats-grid">
                {[0, 1, 2, 3].map((n) => (
                  <Skeleton key={n} className="h-32" />
                ))}
              </div>
              <Skeleton className="h-96" />
            </>
          ) : selectedTournament ? (
            <TournamentManager
              key={`${selectedTournament.id}-${selectedTournament.status === "draft" ? "draft" : "generated"}`}
              tournament={selectedTournament}
              workspace={workspace}
              send={run}
              refresh={refresh}
              onBack={() => setSelected(null)}
              onEdit={() => setWizard(selectedTournament.id)}
            />
          ) : (
            <>
              {page === "dashboard" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="section-kicker">YOUR COMPETITION COMMAND CENTER</div>
                      <h1>
                        {Number(greeting) < 12
                          ? "Good morning"
                          : Number(greeting) < 17
                            ? "Good afternoon"
                            : "Good evening"}
                        , {user.name.split(" ")[0]} <span className="greeting-dot">✦</span>
                      </h1>
                      <p>Here’s what’s happening across your competitions.</p>
                    </div>
                    <Button onClick={startWizard}>
                      <Plus size={18} />
                      Create tournament
                    </Button>
                  </div>
                  {!org && (
                    <div className="onboarding-banner">
                      <span className="feature-icon">
                        <Building2 size={25} />
                      </span>
                      <div>
                        <h3>A home for your competitions.</h3>
                        <p>
                          Create an organization to start building tournaments and bringing people
                          together.
                        </p>
                      </div>
                      <Button onClick={() => setModal("organization")}>
                        Set up workspace
                        <ArrowRight size={16} />
                      </Button>
                    </div>
                  )}
                  <div className="stats-grid">
                    {[
                      {
                        label: "Active tournaments",
                        value: active.length,
                        icon: Trophy,
                        tone: "blue",
                        detail: `${workspace.tournaments.filter((t) => t.status === "draft").length} drafts in progress`,
                      },
                      {
                        label: "Registered entrants",
                        value: workspace.participants.length,
                        icon: Users,
                        tone: "purple",
                        detail: `${workspace.teams.length} teams in your workspace`,
                      },
                      {
                        label: "Matches completed",
                        value: completedMatches.length,
                        icon: CheckCircle2,
                        tone: "green",
                        detail: `${Math.max(0, competitiveMatches.length - completedMatches.length)} matches to play`,
                      },
                      {
                        label: "Open disciplinary cases",
                        value: pendingCases.length,
                        icon: ShieldCheck,
                        tone: "amber",
                        detail: pendingCases.length
                          ? "Review in disciplinary center"
                          : "No cases requiring review",
                      },
                    ].map((stat) => (
                      <Card className="stat-card" key={stat.label}>
                        <div className="stat-top">
                          <span>{stat.label}</span>
                          <div className={`stat-icon ${stat.tone}`}>
                            <stat.icon size={19} />
                          </div>
                        </div>
                        <strong className="stat-value">
                          {stat.value}
                          <span className="stat-value-line" />
                        </strong>
                        <small>
                          {stat.tone === "green" && <span className="tiny-dot" />}
                          {stat.detail}
                        </small>
                      </Card>
                    ))}
                  </div>
                  <div className="dashboard-columns">
                    <section>
                      <Card className="tournaments-panel">
                        <div className="card-heading">
                          <div>
                            <h2>
                              Your tournaments{" "}
                              <span className="count-pill">{workspace.tournaments.length}</span>
                            </h2>
                            <p>The big picture, all in one place.</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => navigate("tournaments")}>
                            View all <ArrowRight size={15} />
                          </Button>
                        </div>
                        {workspace.tournaments.length ? (
                          <div className="tournament-list">
                            {workspace.tournaments.slice(0, 4).map((t) => (
                              <TournamentRow
                                key={t.id}
                                tournament={t}
                                workspace={workspace}
                                onClick={() => openTournament(t.id)}
                              />
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            icon={Trophy}
                            title="The stage is yours."
                            description="Create your first tournament. We’ll keep the fixtures, participants and results organized."
                            action={
                              <Button variant="outline" onClick={startWizard}>
                                <Plus size={16} />
                                Create your first tournament
                              </Button>
                            }
                          />
                        )}
                      </Card>
                      <Card className="activity-panel">
                        <div className="card-heading">
                          <div>
                            <h2>Recent activity</h2>
                            <p>A clear record of every decision.</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => navigate("activity")}>
                            View history <ArrowRight size={15} />
                          </Button>
                        </div>
                        {workspace.audit.length ? (
                          <div className="activity-list">
                            {workspace.audit.slice(0, 4).map((a) => (
                              <div className="activity-item" key={a.id}>
                                <span className="activity-icon">
                                  <Activity size={16} />
                                </span>
                                <div>
                                  <strong>{title(a.action)}</strong>
                                  <p>
                                    {workspace.members.find((m) => m.id === a.actorId)?.name ??
                                      "Workspace member"}
                                  </p>
                                </div>
                                <time>{dateLabel(a.createdAt)}</time>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="quiet-empty">
                            <Activity size={20} />
                            <p>Your workspace activity will appear here.</p>
                          </div>
                        )}
                      </Card>
                    </section>
                    <aside>
                      <Card className="upcoming-panel">
                        <div className="card-heading">
                          <div>
                            <h2>Upcoming matches</h2>
                            <p>Next up on the schedule.</p>
                          </div>
                          <CalendarDays size={18} className="muted" />
                        </div>
                        {upcoming.length ? (
                          <div className="upcoming-list">
                            {upcoming.map((booking) => {
                              const match = workspace.matches.find((m) => m.id === booking.matchId);
                              return (
                                <button
                                  className="upcoming-match"
                                  key={booking.id}
                                  onClick={() => openTournament(booking.tournamentId)}
                                >
                                  <div>
                                    <Badge tone="blue">Round {match?.round}</Badge>
                                    <small>{dateLabel(booking.startsAt)}</small>
                                  </div>
                                  <strong>
                                    {workspace.participants.find(
                                      (p) => p.id === match?.participantA,
                                    )?.name ?? "TBD"}
                                    <span>vs</span>
                                    {workspace.participants.find(
                                      (p) => p.id === match?.participantB,
                                    )?.name ?? "TBD"}
                                  </strong>
                                  <p>
                                    <MapPin size={13} />
                                    {workspace.venues.find((v) => v.id === booking.venueId)?.name}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <EmptyState
                            icon={CalendarDays}
                            title="A clear calendar."
                            description="Once your fixtures are scheduled, your next matches will appear here."
                            action={
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate("scheduling")}
                              >
                                Open scheduling
                                <ArrowRight size={14} />
                              </Button>
                            }
                          />
                        )}
                      </Card>
                      <div className="brand-card">
                        <div className="brand-card-top">
                          <span className="brand-mini">
                            <Trophy size={18} /> THE TOURNIVO WAY
                          </span>
                          <Globe2 size={23} />
                        </div>
                        <h3>
                          Every sport.
                          <br />
                          Every level.
                          <br />
                          <span>Your rules.</span>
                        </h3>
                        <p>One platform. All the possibilities.</p>
                        <button onClick={() => navigate("catalog")}>
                          Explore sports & games
                          <ArrowUpRight size={17} />
                        </button>
                        <div className="brand-card-lines" aria-hidden="true" />
                      </div>
                    </aside>
                  </div>
                  <div className="workspace-footer">
                    <span>
                      <span className="tiny-dot" /> Your workspace is up to date
                    </span>
                    <p>Every Competition. Perfectly Organized.</p>
                  </div>
                </>
              )}
              {page === "tournaments" && (
                <>
                  <PageHeading
                    kicker="THE COMPETITION STARTS HERE"
                    title="Tournaments"
                    description="From the first fixture to the final celebration."
                    action={
                      canManage || !org ? (
                        <Button onClick={startWizard}>
                          <Plus size={17} />
                          Create tournament
                        </Button>
                      ) : undefined
                    }
                  />
                  <div className="list-toolbar">
                    <div className="segmented-filters">
                      {["all", "active", "draft", "completed"].map((s) => (
                        <button
                          className={statusFilter === s ? "selected" : ""}
                          onClick={() => setStatusFilter(s)}
                          key={s}
                        >
                          {title(s)}
                          <span>
                            {s === "all"
                              ? workspace.tournaments.length
                              : workspace.tournaments.filter((t) => t.status === s).length}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="search-input">
                      <Search size={17} />
                      <Input
                        placeholder="Find a tournament…"
                        aria-label="Find a tournament"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <Card>
                    {tournaments.length ? (
                      <div className="tournament-list">
                        {tournaments.map((t) => (
                          <TournamentRow
                            key={t.id}
                            tournament={t}
                            workspace={workspace}
                            onClick={() => openTournament(t.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={Trophy}
                        title={
                          search ? "No tournaments found." : "Your next competition starts here."
                        }
                        description={
                          search
                            ? "Try another name or clear your filters."
                            : "Create a tournament, set your own rules, and bring the competition to life."
                        }
                        action={
                          <Button onClick={startWizard}>
                            <Plus size={16} />
                            Create tournament
                          </Button>
                        }
                      />
                    )}
                  </Card>
                </>
              )}
              {page === "teams" && (
                <>
                  <PageHeading
                    kicker="THE PEOPLE BEHIND THE PLAY"
                    title="Teams & players"
                    description="Every roster is yours to define. No preset limits."
                    action={
                      canManage ? (
                        <div className="team-page-actions">
                          <Button variant="outline" onClick={() => setModal("random-teams")}>
                            <Shuffle size={17} />
                            Generate random teams
                          </Button>
                          <Button onClick={() => setModal("team")}>
                            <Plus size={17} />
                            Add team
                          </Button>
                        </div>
                      ) : undefined
                    }
                  />
                  <div className="collection-grid">
                    {workspace.teams.map((team, i) => {
                      const roster = workspace.rosters.filter((r) => r.teamId === team.id);
                      return (
                        <Card className="team-card" key={team.id}>
                          <div className="team-card-top">
                            <span className={`team-emblem emblem-${i % 4}`}>
                              {team.shortName ?? initials(team.name)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Manage ${team.name}`}
                              onClick={() => setRosterTeam(team.id)}
                            >
                              <MoreHorizontal size={19} />
                            </Button>
                          </div>
                          <h3>{team.name}</h3>
                          <p>
                            {roster.filter((r) => !["coach", "manager"].includes(r.role)).length}{" "}
                            registered players ·{" "}
                            {roster.filter((r) => ["coach", "manager"].includes(r.role)).length}{" "}
                            staff
                          </p>
                          <div className="team-roster-preview">
                            {roster.slice(0, 5).map((r) => (
                              <span
                                className="avatar small"
                                key={r.id}
                                title={workspace.players.find((p) => p.id === r.playerId)?.name}
                              >
                                {initials(
                                  workspace.players.find((p) => p.id === r.playerId)?.name ?? "?",
                                )}
                              </span>
                            ))}
                            {!roster.length && (
                              <span className="muted">Ready to build your roster</span>
                            )}
                          </div>
                          <button className="text-link" onClick={() => setRosterTeam(team.id)}>
                            Manage roster
                            <ArrowRight size={15} />
                          </button>
                        </Card>
                      );
                    })}
                    {!workspace.teams.length && (
                      <Card className="full-span">
                        <EmptyState
                          icon={Users}
                          title="Bring your people together."
                          description="Create teams and add players, captains, substitutes and coaches. Roster size is always your choice."
                          action={
                            canManage ? (
                              <Button onClick={() => setModal("team")}>
                                <Plus size={16} />
                                Add your first team
                              </Button>
                            ) : undefined
                          }
                        />
                      </Card>
                    )}
                  </div>
                  {workspace.players.some((p) =>
                    workspace.participants.some((r) => r.playerId === p.id),
                  ) && (
                    <Card className="section-card">
                      <h2>Individual competitors</h2>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Participant</th>
                              <th>Tournament</th>
                              <th>Eligibility</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workspace.participants
                              .filter((p) => p.playerId)
                              .map((p) => (
                                <tr key={p.id}>
                                  <td>{p.name}</td>
                                  <td>
                                    {
                                      workspace.tournaments.find((t) => t.id === p.tournamentId)
                                        ?.name
                                    }
                                  </td>
                                  <td>
                                    <StatusBadge status={p.eligibility} />
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </>
              )}
              {page === "scheduling" && (
                <>
                  <PageHeading
                    kicker="MAKE EVERY MATCH FIT"
                    title="Scheduling"
                    description="Resources, availability and fixtures — in sync."
                    action={
                      canManage ? (
                        <Button onClick={() => setModal("venue")}>
                          <Plus size={17} />
                          Add venue or server
                        </Button>
                      ) : undefined
                    }
                  />
                  <div className="collection-grid">
                    {workspace.venues.map((v) => (
                      <Card className="venue-card" key={v.id}>
                        <span className="feature-icon">
                          <MapPin size={22} />
                        </span>
                        <h3>{v.name}</h3>
                        <p>
                          {title(v.kind)} · {v.timezone}
                        </p>
                        <Badge tone="green">
                          {v.availability.length} availability window
                          {v.availability.length !== 1 ? "s" : ""}
                        </Badge>
                        {v.availability.map((w, i) => (
                          <small key={i}>
                            {dateLabel(w.start)} – {dateLabel(w.end)}
                          </small>
                        ))}
                      </Card>
                    ))}
                  </div>
                  <Card className="section-card">
                    <div className="card-heading">
                      <div>
                        <h2>Scheduled fixtures</h2>
                        <p>Generate a validated schedule from any tournament’s Schedule tab.</p>
                      </div>
                    </div>
                    {workspace.schedules.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Match</th>
                              <th>Tournament</th>
                              <th>Venue / server</th>
                              <th>Start</th>
                              <th>End</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workspace.schedules.map((b) => (
                              <tr key={b.id}>
                                <td>{workspace.matches.find((m) => m.id === b.matchId)?.key}</td>
                                <td>
                                  <button
                                    className="text-link"
                                    onClick={() => openTournament(b.tournamentId)}
                                  >
                                    {
                                      workspace.tournaments.find((t) => t.id === b.tournamentId)
                                        ?.name
                                    }
                                  </button>
                                </td>
                                <td>{workspace.venues.find((v) => v.id === b.venueId)?.name}</td>
                                <td>{dateLabel(b.startsAt)}</td>
                                <td>{dateLabel(b.endsAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        icon={CalendarDays}
                        title="Give every match its moment."
                        description="Add venue availability, then open a tournament to generate fixtures checked for overlaps and rest conflicts."
                      />
                    )}
                  </Card>
                </>
              )}
              {(page === "rulebooks" || page === "discipline") && (
                <>
                  <PageHeading
                    kicker={
                      page === "rulebooks"
                        ? "FAIR PLAY STARTS WITH CLEAR RULES"
                        : "INTEGRITY AT EVERY STAGE"
                    }
                    title={page === "rulebooks" ? "Rulebooks" : "Disciplinary center"}
                    description={
                      page === "rulebooks"
                        ? "Independent, versioned rules. A shared understanding for everyone."
                        : "A fair process, clear decisions and a complete record."
                    }
                  />
                  <Card>
                    {page === "discipline" && workspace.cases.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Case</th>
                              <th>Tournament</th>
                              <th>Status</th>
                              <th>Reported</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {workspace.cases.map((c) => (
                              <tr key={c.id}>
                                <td>
                                  <strong>{c.title}</strong>
                                </td>
                                <td>
                                  {workspace.tournaments.find((t) => t.id === c.tournamentId)?.name}
                                </td>
                                <td>
                                  <StatusBadge status={c.status} />
                                </td>
                                <td>{dateLabel(c.createdAt)}</td>
                                <td>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openTournament(c.tournamentId)}
                                  >
                                    Review
                                    <ArrowRight size={14} />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : workspace.tournaments.length ? (
                      <div className="tournament-list">
                        {workspace.tournaments.map((t) => (
                          <button
                            className="resource-row"
                            key={t.id}
                            onClick={() => openTournament(t.id)}
                          >
                            <span className="feature-icon">
                              {page === "rulebooks" ? (
                                <BookOpen size={22} />
                              ) : (
                                <ShieldCheck size={22} />
                              )}
                            </span>
                            <div>
                              <strong>{t.name}</strong>
                              <p>
                                {page === "rulebooks"
                                  ? "Open the tournament to manage and acknowledge published rulebooks."
                                  : `${workspace.cases.filter((c) => c.tournamentId === t.id).length} disciplinary cases`}
                              </p>
                            </div>
                            <ArrowRight size={17} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={page === "rulebooks" ? BookOpen : ShieldCheck}
                        title={
                          page === "rulebooks"
                            ? "Your rules deserve a proper home."
                            : "A fair competition, by design."
                        }
                        description="Create a tournament to manage its independent rulebook, cases, decisions and appeals."
                        action={
                          <Button variant="outline" onClick={startWizard}>
                            Create tournament
                            <ArrowRight size={16} />
                          </Button>
                        }
                      />
                    )}
                  </Card>
                </>
              )}
              {page === "catalog" && (
                <>
                  <PageHeading
                    kicker="EVERY KIND OF COMPETITION"
                    title="Sports & games"
                    description="A starting point for your competition. Every suggestion is customizable."
                  />
                  <div className="list-toolbar">
                    <div className="search-input">
                      <Search size={17} />
                      <Input
                        aria-label="Search sports and games"
                        placeholder="Find your sport or game…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <Badge>{workspace.catalog.length} sports & games</Badge>
                  </div>
                  <div className="collection-grid catalog-grid">
                    {workspace.catalog
                      .filter((s) =>
                        `${s.name} ${s.category}`.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((s) => (
                        <Card className="catalog-card" key={s.id}>
                          <div
                            className={`catalog-icon ${s.category === "esport" ? "purple" : "blue"}`}
                          >
                            {s.category === "esport" ? (
                              <Gamepad2 size={25} />
                            ) : (
                              <Trophy size={24} />
                            )}
                          </div>
                          <Badge>{s.category === "esport" ? "Esports" : title(s.category)}</Badge>
                          <h3>{s.name}</h3>
                          <p>{s.description}</p>
                          <div className="catalog-meta">
                            <Users size={14} />
                            {s.suggestedRoster
                              ? `Suggested: ${s.suggestedRoster} player${s.suggestedRoster > 1 ? "s" : ""}`
                              : "Your participant structure"}
                          </div>
                          <small>Suggestions only. You set the limits.</small>
                        </Card>
                      ))}
                  </div>
                </>
              )}
              {page === "formats" && (
                <>
                  <PageHeading
                    kicker="A FORMAT FOR EVERY AMBITION"
                    title="Format library"
                    description="Understand your options. Generate with tested strategies."
                  />
                  <div className="collection-grid">
                    {formatLibrary.map((f) => (
                      <Card className="format-card" key={f.id}>
                        <div className="format-card-top">
                          <Swords size={24} />
                          <Badge tone={f.supported ? "green" : "neutral"}>
                            {f.supported ? "Available" : "Planned"}
                          </Badge>
                        </div>
                        <h3>{f.name}</h3>
                        <p>{f.description}</p>
                        <Button variant="ghost" size="sm" onClick={() => setInfoFormat(f.id)}>
                          <Info size={16} />
                          How it works
                        </Button>
                      </Card>
                    ))}
                  </div>
                </>
              )}
              {page === "activity" && (
                <>
                  <PageHeading
                    kicker="EVERY ACTION, ACCOUNTED FOR"
                    title="Activity log"
                    description="Your organization’s administrative history."
                  />
                  <Card>
                    {workspace.audit.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Action</th>
                              <th>By</th>
                              <th>Reference</th>
                              <th>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workspace.audit.map((a) => (
                              <tr key={a.id}>
                                <td>
                                  <Badge tone="blue">{title(a.action)}</Badge>
                                </td>
                                <td>
                                  {workspace.members.find((m) => m.id === a.actorId)?.name ??
                                    "Workspace member"}
                                </td>
                                <td>
                                  <code>{a.entityId.slice(0, 8)}</code>
                                </td>
                                <td>{dateLabel(a.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        icon={Activity}
                        title="A fresh start."
                        description="Your authorized administrative actions will be recorded here."
                      />
                    )}
                  </Card>
                </>
              )}
              {page === "settings" && (
                <>
                  <PageHeading
                    kicker="YOUR WORKSPACE, YOUR WAY"
                    title="Settings"
                    description="Manage your organization, access and preferences."
                  />
                  <Card className="settings-card">
                    <h2>Organization</h2>
                    <div className="settings-row">
                      <div>
                        <strong>{org?.name ?? "No organization yet"}</strong>
                        <p>
                          {org
                            ? `Your role: ${title(org.role)}`
                            : "Create a workspace for your competitions."}
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => setModal("organization")}>
                        <Plus size={16} />
                        New organization
                      </Button>
                    </div>
                    <div className="settings-row">
                      <div>
                        <strong>Appearance</strong>
                        <p>Choose a light or dark workspace.</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                      >
                        {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}Switch
                        theme
                      </Button>
                    </div>
                  </Card>
                  <Card className="section-card">
                    <div className="card-heading">
                      <div>
                        <h2>Workspace members</h2>
                        <p>
                          Add existing Tournivo accounts. Only organization owners can change
                          membership.
                        </p>
                      </div>
                      {org?.role === "owner" && (
                        <Button onClick={() => setModal("member")}>
                          <Plus size={16} />
                          Add member
                        </Button>
                      )}
                    </div>
                    {workspace.members.length > 0 && (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workspace.members.map((m) => (
                              <tr key={m.id}>
                                <td>{m.name}</td>
                                <td>{m.email}</td>
                                <td>
                                  <Badge>{title(m.role)}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                </>
              )}
            </>
          )}
        </main>
      </div>
      {wizard && workspace?.organization && (
        <TournamentWizard
          workspace={workspace}
          existing={workspace.tournaments.find((t) => t.id === wizard)}
          send={(command) =>
            command.action === "teams.generate" ? run(command) : sendCommand(command)
          }
          onClose={() => setWizard(null)}
          onSaved={async (id) => {
            await refresh();
            openTournament(id);
          }}
        />
      )}
      {modal === "random-teams" && org && (
        <RandomTeamGenerator
          organizationId={org.id}
          send={sendCommand}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
          }}
        />
      )}
      <Dialog
        open={modal === "organization"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Create an organization"
        description="A shared home for your teams and competitions."
      >
        <CommandForm
          onSubmit={async (data) => {
            const result = await run({
              action: "organization.create",
              name: String(data.get("name")),
            });
            setOrgId(String(result.id));
            setModal(null);
            toast.success("Your workspace is ready.");
          }}
        >
          <Field label="Organization name">
            <Input
              name="name"
              required
              minLength={2}
              maxLength={160}
              placeholder="e.g. Summit Sports Club"
              autoFocus
            />
          </Field>
          <Button type="submit">
            Create organization
            <ArrowRight size={16} />
          </Button>
        </CommandForm>
      </Dialog>
      <Dialog
        open={modal === "team"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Add a team"
        description="Start with a name. Build your roster your way."
      >
        <CommandForm
          onSubmit={async (data) => {
            await run({
              action: "team.create",
              organizationId: org!.id,
              name: String(data.get("name")),
              shortName: String(data.get("shortName")) || undefined,
            });
            setModal(null);
            toast.success("Team created.");
          }}
        >
          <Field label="Team name">
            <Input name="name" required minLength={2} placeholder="e.g. Summit Strikers" />
          </Field>
          <Field label="Short name (optional)">
            <Input name="shortName" maxLength={8} placeholder="SUM" />
          </Field>
          <Button type="submit">
            <Plus size={16} />
            Add team
          </Button>
        </CommandForm>
      </Dialog>
      <Dialog
        open={modal === "venue"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Add a venue or server"
        description="Define an availability window in UTC."
      >
        <CommandForm
          onSubmit={async (data) => {
            await run({
              action: "venue.create",
              organizationId: org!.id,
              name: String(data.get("name")),
              kind: String(data.get("kind")) as "court" | "field" | "server" | "venue",
              timezone: String(data.get("timezone")),
              availability: [
                {
                  start: new Date(`${data.get("start")}Z`).toISOString(),
                  end: new Date(`${data.get("end")}Z`).toISOString(),
                },
              ],
            });
            setModal(null);
            toast.success("Resource and availability saved.");
          }}
        >
          <Field label="Resource name">
            <Input
              name="name"
              required
              minLength={2}
              placeholder="e.g. Main court or EU Server 1"
            />
          </Field>
          <div className="form-grid">
            <Field label="Type">
              <Select name="kind">
                <option value="court">Court</option>
                <option value="field">Field</option>
                <option value="server">Server</option>
                <option value="venue">Venue</option>
              </Select>
            </Field>
            <Field label="Display timezone">
              <Input name="timezone" defaultValue="Asia/Karachi" required />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Available from (UTC)">
              <Input name="start" type="datetime-local" required />
            </Field>
            <Field label="Available until (UTC)">
              <Input name="end" type="datetime-local" required />
            </Field>
          </div>
          <Button type="submit">
            <Plus size={16} />
            Add resource
          </Button>
        </CommandForm>
      </Dialog>
      <Dialog
        open={modal === "member"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Add a workspace member"
        description="The person must already have a Tournivo account."
      >
        <CommandForm
          onSubmit={async (data) => {
            await run({
              action: "organization.member",
              organizationId: org!.id,
              email: String(data.get("email")),
              role: String(data.get("role")) as "organizer",
            });
            setModal(null);
            toast.success("Membership updated.");
          }}
        >
          <Field label="Account email">
            <Input name="email" type="email" required />
          </Field>
          <Field
            label="Organization role"
            hint="Tournament admins and referees also need a tournament assignment before they can make changes."
          >
            <Select name="role">
              {["organizer", "admin", "referee", "manager", "player", "spectator"].map((r) => (
                <option key={r} value={r}>
                  {title(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Save member</Button>
        </CommandForm>
      </Dialog>
      <Dialog
        open={modal === "notifications"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Notifications"
        description="Updates from your workspace."
      >
        <div className="dialog-body">
          {workspace?.notifications.length ? (
            workspace.notifications.map((n) => (
              <div className="notification-item" key={n.id}>
                <Bell size={18} />
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.message}</p>
                  <small>{dateLabel(n.createdAt)}</small>
                </div>
                {!n.readAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void run({
                        action: "notification.read",
                        organizationId: org!.id,
                        notificationId: n.id,
                      })
                    }
                  >
                    Mark read
                  </Button>
                )}
              </div>
            ))
          ) : (
            <EmptyState
              icon={Bell}
              title="All caught up."
              description="Your notifications will appear here."
            />
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!rosterTeam}
        onOpenChange={(open) => !open && setRosterTeam(null)}
        title={workspace?.teams.find((t) => t.id === rosterTeam)?.name ?? "Team roster"}
        description="Players, substitutes and staff stay distinct."
      >
        <div className="dialog-body">
          <div className="roster-list">
            {workspace?.rosters
              .filter((r) => r.teamId === rosterTeam)
              .map((r) => (
                <div key={r.id}>
                  <span className="avatar small">
                    {initials(workspace.players.find((p) => p.id === r.playerId)?.name ?? "?")}
                  </span>
                  <strong>{workspace.players.find((p) => p.id === r.playerId)?.name}</strong>
                  <Badge>{title(r.role)}</Badge>
                </div>
              ))}
          </div>
        </div>
        <CommandForm
          onSubmit={async (data) => {
            await run({
              action: "roster.add",
              organizationId: org!.id,
              teamId: rosterTeam!,
              name: String(data.get("name")),
              email: String(data.get("email")) || undefined,
              role: String(data.get("role")) as "player",
            });
            toast.success("Roster member added.");
          }}
        >
          <Field label="Member name">
            <Input name="name" minLength={2} required />
          </Field>
          <Field
            label="Link account email (optional)"
            hint="The player must already be a workspace member."
          >
            <Input name="email" type="email" />
          </Field>
          <Field label="Role">
            <Select name="role">
              {["player", "captain", "substitute", "coach", "manager"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit">
            <Plus size={16} />
            Add to roster
          </Button>
        </CommandForm>
        {canManage && (
          <CommandForm
            onSubmit={async (data) => {
              await run({
                action: "team.assign-manager",
                organizationId: org!.id,
                teamId: rosterTeam!,
                userId: String(data.get("manager")),
              });
              toast.success("Team manager assigned.");
            }}
          >
            <Field
              label="Team manager account"
              hint="The assigned manager can respond to cases and submit appeals for this team."
            >
              <Select name="manager">
                {workspace?.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="outline">
              Assign manager
            </Button>
          </CommandForm>
        )}
      </Dialog>
      {info && (
        <Dialog
          open
          onOpenChange={() => setInfoFormat(null)}
          title={info.name}
          description={info.description}
        >
          <div className="dialog-body format-info">
            <Badge tone={info.supported ? "green" : "amber"}>
              {info.supported ? "Verified core strategy" : "Not available for generation"}
            </Badge>
            <h4>Example with 8 entrants</h4>
            <p>{info.example}</p>
            <dl>
              <dt>Advantages</dt>
              <dd>{info.advantages}</dd>
              <dt>Tradeoffs</dt>
              <dd>{info.disadvantages}</dd>
              <dt>Expected matches</dt>
              <dd>{info.matches}</dd>
              <dt>Expected rounds</dt>
              <dd>{info.rounds}</dd>
              <dt>Advancement</dt>
              <dd>{info.advancement}</dd>
              <dt>Tie handling</dt>
              <dd>{info.ties}</dd>
            </dl>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function PageHeading({
  kicker,
  title: heading,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="section-kicker">{kicker}</span>
        <h1>{heading}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function TournamentRow({
  tournament: t,
  workspace,
  onClick,
}: {
  tournament: Workspace["tournaments"][number];
  workspace: Workspace;
  onClick: () => void;
}) {
  const matches = workspace.matches.filter((m) => m.tournamentId === t.id && m.status !== "bye"),
    done = matches.filter((m) => m.status === "completed").length;
  const entrants = workspace.participants.filter((p) => p.tournamentId === t.id).length;
  const sport = workspace.catalog.find((s) => s.id === t.sportId);
  return (
    <button className="tournament-row" onClick={onClick}>
      <div className={`tournament-icon ${sport?.category === "esport" ? "purple" : "blue"}`}>
        {sport?.category === "esport" ? <Gamepad2 size={25} /> : <Trophy size={23} />}
      </div>
      <div className="tournament-row-main">
        <div>
          <h3>{t.name}</h3>
          <StatusBadge status={t.status} />
        </div>
        <p>
          {sport?.name ?? "Custom competition"}
          <span>·</span>
          {formatLibrary.find((f) => f.id === t.format)?.name}
        </p>
        <div className="tournament-meta">
          <span>
            <Users size={13} />
            {entrants ||
              (Array.isArray(t.draft.entrantNames) ? t.draft.entrantNames.length : 0)}{" "}
            entrants
          </span>
          <span>
            <CalendarDays size={13} />
            {dateLabel(t.createdAt, { month: "short", day: "numeric", year: "numeric" })}
          </span>
          {t.visibility === "public" && (
            <span>
              <Globe2 size={13} />
              Public
            </span>
          )}
        </div>
      </div>
      <div className="tournament-progress">
        <div>
          <span>{t.status === "draft" ? "Draft saved" : "Progress"}</span>
          <strong>{matches.length ? Math.round((done / matches.length) * 100) : 0}%</strong>
        </div>
        <div className="progress-track">
          <div style={{ width: `${matches.length ? (done / matches.length) * 100 : 0}%` }} />
        </div>
        <small>
          {done} of {matches.length} matches
        </small>
      </div>
      <ChevronRight size={18} className="row-chevron" />
    </button>
  );
}
