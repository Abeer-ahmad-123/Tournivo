"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Info,
  Save,
  Sparkles,
  Users,
  Trophy,
  Settings2,
  ShieldCheck,
  CalendarDays,
  ClipboardCheck,
  Flag,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import { tournamentDraftSchema, type Command, type TournamentDraft } from "@/lib/contracts";
import type { Workspace } from "@/lib/queries";
import { formatLibrary } from "@/modules/tournaments/registry";
import { getFormat } from "@/modules/tournaments/registry";
import { Button, Dialog, Field, Input, Select, Textarea, Badge } from "./ui/primitives";
import { RandomTeamGenerator } from "./random-team-generator";
const steps = [
  { name: "The essentials", icon: Flag },
  { name: "Participants", icon: Users },
  { name: "Tournament format", icon: Trophy },
  { name: "Competition setup", icon: Settings2 },
  { name: "Your rulebook", icon: ShieldCheck },
  { name: "Scheduling", icon: CalendarDays },
  { name: "Registration", icon: ClipboardCheck },
  { name: "Review & generate", icon: Sparkles },
];
const defaults: TournamentDraft = {
  name: "",
  description: "",
  sportId: "football",
  category: "sport",
  format: "single-elimination",
  participantType: "team",
  entrantNames: [
    "Team Alpha",
    "Team Bravo",
    "Team Charlie",
    "Team Delta",
    "Team Echo",
    "Team Foxtrot",
    "Team Golf",
    "Team Hotel",
  ],
  roster: { equalSizes: false },
  online: false,
  points: { win: 3, draw: 1, loss: 0 },
  durationMinutes: 60,
  restMinutes: 15,
  bestOf: 1,
  timezone: "Asia/Karachi",
  startsAt: "",
  endsAt: "",
  visibility: "private",
  registration: "manual",
  registrationDeadline: "",
  rulebookNotes: "",
  step: 0,
};
export function TournamentWizard({
  workspace,
  existing,
  onClose,
  onSaved,
  send,
}: {
  workspace: Workspace;
  existing?: Workspace["tournaments"][number];
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
  send: (command: Command) => Promise<Record<string, unknown>>;
}) {
  const restored = existing ? tournamentDraftSchema.safeParse(existing.draft) : null;
  const initial = restored?.success ? restored.data : defaults;
  const {
    register,
    control,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<z.input<typeof tournamentDraftSchema>, unknown, TournamentDraft>({
    resolver: zodResolver(tournamentDraftSchema),
    defaultValues: initial,
  });
  const [step, setStep] = useState(initial.step),
    [randomTeams, setRandomTeams] = useState(false),
    [busy, setBusy] = useState(false),
    [info, setInfo] = useState<string | null>(null),
    [savedIdentity, setSavedIdentity] = useState<{ id: string; revision: number } | null>(
      existing ? { id: existing.id, revision: existing.revision } : null,
    );
  const values = useWatch({ control }),
    chosen = formatLibrary.find((f) => f.id === values.format)!,
    sport = workspace.catalog.find((s) => s.id === values.sportId);
  const org = workspace.organization!;
  const infoFormat = formatLibrary.find((f) => f.id === info);
  function numberValue(value: string) {
    return value === "" ? undefined : Number(value);
  }
  async function save(generate: boolean) {
    if (!(await trigger())) {
      toast.error("Check the highlighted fields before saving.");
      return;
    }
    setBusy(true);
    try {
      const draft = tournamentDraftSchema.parse({ ...getValues(), step });
      const saved = await send({
        action: "tournament.save",
        organizationId: org.id,
        tournamentId: savedIdentity?.id,
        expectedRevision: savedIdentity?.revision ?? 0,
        draft,
      });
      const id = String(saved.id);
      const savedRevision = savedIdentity ? savedIdentity.revision + 1 : 0;
      // Generation may reject a roster or format. Retain the successful save identity
      // so retrying never creates another draft or submits an obsolete revision.
      setSavedIdentity({ id, revision: savedRevision });
      if (generate) {
        try {
          await send({
            action: "tournament.generate",
            organizationId: org.id,
            tournamentId: id,
            expectedRevision: savedRevision,
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (error) {
          await onSaved(id);
          throw error;
        }
      }
      toast.success(
        generate
          ? "Your tournament is ready. Let the competition begin."
          : "Draft saved to your workspace.",
      );
      await onSaved(id);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save tournament.");
    } finally {
      setBusy(false);
    }
  }
  const preview = (() => {
    try {
      return getFormat(values.format!).generate(
        (values.entrantNames ?? []).map((name, i) => ({ id: String(i), name })),
      );
    } catch {
      return null;
    }
  })();
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
        title={existing ? "Continue your tournament" : "Create a tournament"}
        description="Your next great competition starts here."
        wide
      >
        <div className="wizard-layout">
          <aside className="wizard-steps">
            {steps.map((s, i) => (
              <button
                key={s.name}
                className={i === step ? "selected" : i < step ? "done" : ""}
                onClick={() => {
                  setStep(i);
                  setValue("step", i);
                }}
              >
                <span>{i < step ? <Check size={15} /> : <s.icon size={16} />}</span>
                <div>
                  <small>STEP {i + 1}</small>
                  {s.name}
                </div>
              </button>
            ))}
            <div className="wizard-trust">
              <ShieldCheck size={18} />
              <p>Your tournament. Your rules. Every setting stays in your control.</p>
            </div>
          </aside>
          <div className="wizard-main">
            <div className="wizard-section-heading">
              <span className="section-kicker">STEP {step + 1} OF 8</span>
              <h3>{steps[step].name}</h3>
            </div>
            <div className="wizard-fields">
              {step === 0 && (
                <>
                  <Field label="Tournament name" error={errors.name?.message}>
                    <Input
                      {...register("name")}
                      placeholder="e.g. Autumn Champions Cup"
                      autoFocus
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="Sport or game">
                      <Select
                        {...register("sportId")}
                        onChange={(e) => {
                          setValue("sportId", e.target.value);
                          const selected = workspace.catalog.find((s) => s.id === e.target.value);
                          setValue(
                            "category",
                            (selected?.category ?? "custom") as "sport" | "esport" | "custom",
                          );
                        }}
                      >
                        {workspace.catalog.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Competition location">
                      <Select
                        value={values.online ? "online" : "physical"}
                        onChange={(e) => setValue("online", e.target.value === "online")}
                      >
                        <option value="physical">In person</option>
                        <option value="online">Online</option>
                      </Select>
                    </Field>
                  </div>
                  <Field
                    label="Description"
                    hint="Tell participants what makes this competition special."
                  >
                    <Textarea
                      {...register("description")}
                      placeholder="The stage is set for…"
                      rows={4}
                    />
                  </Field>
                  <div className="info-banner">
                    <Trophy size={20} />
                    <p>From neighborhood leagues to global esports. Make this competition yours.</p>
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <div className="wizard-random-teams">
                    <div>
                      <h4>Start with players, build your teams</h4>
                      <p>Randomly split player names and generate team names.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setRandomTeams(true)}>
                      <Shuffle size={15} />
                      Generate random teams
                    </Button>
                  </div>
                  <Field label="Participant structure">
                    <Select {...register("participantType")}>
                      <option value="team">Teams</option>
                      <option value="individual">Individuals</option>
                      <option value="doubles">Doubles</option>
                      <option value="mixed-doubles">Mixed doubles</option>
                      <option value="relay">Relay teams</option>
                      <option value="custom">Custom teams</option>
                    </Select>
                  </Field>
                  <Field
                    label="Entrant names — one per line"
                    hint={`${values.entrantNames?.length ?? 0} entrants. Names are editable examples until you save.`}
                    error={errors.entrantNames?.message ?? errors.entrantNames?.root?.message}
                  >
                    <Textarea
                      rows={6}
                      value={(values.entrantNames ?? []).join("\n")}
                      onChange={(e) => setValue("entrantNames", e.target.value.split("\n"))}
                    />
                  </Field>
                  {values.participantType !== "individual" && (
                    <>
                      <div className="info-banner">
                        <Info size={19} />
                        <p>
                          {sport?.name} suggests {sport?.suggestedRoster ?? "custom"} players. This
                          is a suggestion. Set only the limits you need; blank fields impose no
                          restriction.
                        </p>
                      </div>
                      <div className="form-grid">
                        {(
                          [
                            { key: "minimum", label: "Minimum roster" },
                            { key: "maximum", label: "Maximum roster" },
                            { key: "activeLineup", label: "Active lineup" },
                            { key: "substitutes", label: "Maximum substitutes" },
                          ] as const
                        ).map((f) => (
                          <Field
                            key={f.key}
                            label={f.label}
                            error={errors.roster?.[f.key]?.message}
                          >
                            <Input
                              type="number"
                              min={f.key === "substitutes" ? 0 : 1}
                              placeholder="Unrestricted"
                              value={values.roster?.[f.key] ?? ""}
                              onChange={(e) =>
                                setValue(`roster.${f.key}`, numberValue(e.target.value))
                              }
                            />
                          </Field>
                        ))}
                      </div>
                      <label className="checkbox-row">
                        <input type="checkbox" {...register("roster.equalSizes")} /> Require equal
                        roster sizes
                      </label>
                      <p className="field-hint">
                        Add people to teams in Teams & players before generating if you configure a
                        minimum or active lineup.
                      </p>
                    </>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <p className="muted">Choose how the competition unfolds.</p>
                  <div className="format-options">
                    {formatLibrary
                      .filter((f) => f.supported)
                      .map((f) => (
                        <div
                          key={f.id}
                          className={`format-option ${values.format === f.id ? "selected" : ""}`}
                        >
                          <button
                            className="format-choice"
                            onClick={() => setValue("format", f.id as TournamentDraft["format"])}
                          >
                            <span className="radio-dot" />
                            <div>
                              <strong>{f.name}</strong>
                              <p>{f.description}</p>
                            </div>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setInfo(f.id)}
                            aria-label={`About ${f.name}`}
                          >
                            <Info size={18} />
                          </Button>
                        </div>
                      ))}
                  </div>
                  <p className="field-hint">
                    Advanced and hybrid formats are listed in the Format Library. Only verified
                    strategies can generate a tournament.
                  </p>
                  <div className="estimate-box">
                    <span>
                      <strong>
                        {preview?.matches.filter((m) => m.status !== "bye").length ?? "—"}
                      </strong>{" "}
                      competitive matches
                    </span>
                    <span>
                      <strong>
                        {preview ? Math.max(...preview.matches.map((m) => m.round)) : "—"}
                      </strong>{" "}
                      rounds
                    </span>
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <div className="form-grid">
                    <Field label="Match duration (minutes)" error={errors.durationMinutes?.message}>
                      <Input
                        type="number"
                        min={1}
                        {...register("durationMinutes", { valueAsNumber: true })}
                      />
                    </Field>
                    <Field label="Minimum rest (minutes)">
                      <Input
                        type="number"
                        min={0}
                        {...register("restMinutes", { valueAsNumber: true })}
                      />
                    </Field>
                  </div>
                  {["round-robin", "double-round-robin"].includes(values.format ?? "") && (
                    <>
                      <h4>Standings points</h4>
                      <div className="form-grid three">
                        {(["win", "draw", "loss"] as const).map((p) => (
                          <Field key={p} label={p[0].toUpperCase() + p.slice(1)}>
                            <Input
                              type="number"
                              {...register(`points.${p}`, { valueAsNumber: true })}
                            />
                          </Field>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="info-banner">
                    <Info size={20} />
                    <p>
                      Entrant order defines seeding. Elimination requires a decisive score. League
                      tiebreakers are points, score difference, then scores for; remaining ties
                      share rank.
                    </p>
                  </div>
                  <p className="field-hint">
                    A match records a single final score. Group knockout uses two groups, top two
                    qualifiers and 3/1/0 group points; original seed breaks a remaining
                    qualification tie. Multi-game series configuration is planned.
                  </p>
                </>
              )}
              {step === 4 && (
                <>
                  <div className="feature-illustration">
                    <ShieldCheck size={38} />
                  </div>
                  <h4>Your competition has its own rulebook.</h4>
                  <p className="muted">
                    Conduct, eligibility, evidence requirements, penalties and appeals belong in a
                    versioned rulebook, independently of scoring and match settings.
                  </p>
                  <Field
                    label="Rulebook planning notes"
                    hint="Private draft notes. These do not publish rules or apply penalties."
                  >
                    <Textarea
                      {...register("rulebookNotes")}
                      rows={5}
                      placeholder="Attendance policy, fair play, roster eligibility…"
                    />
                  </Field>
                  <div className="info-banner">
                    <Info size={20} />
                    <p>
                      After saving, open the Rulebook Builder to publish rules with an effective
                      date and preserve participant acknowledgements.
                    </p>
                  </div>
                </>
              )}
              {step === 5 && (
                <>
                  <Field label="Display timezone" error={errors.timezone?.message}>
                    <Select {...register("timezone")}>
                      {[
                        "UTC",
                        "Asia/Karachi",
                        "Asia/Kolkata",
                        "Asia/Dubai",
                        "Europe/London",
                        "Europe/Berlin",
                        "America/New_York",
                        "America/Los_Angeles",
                        "Asia/Singapore",
                        "Australia/Sydney",
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  </Field>
                  <div className="form-grid">
                    <Field label="Start (UTC, optional)" error={errors.startsAt?.message}>
                      <Input
                        type="datetime-local"
                        value={values.startsAt?.slice(0, 16) ?? ""}
                        onChange={(e) =>
                          setValue(
                            "startsAt",
                            e.target.value ? new Date(`${e.target.value}Z`).toISOString() : "",
                          )
                        }
                      />
                    </Field>
                    <Field label="End (UTC, optional)" error={errors.endsAt?.message}>
                      <Input
                        type="datetime-local"
                        value={values.endsAt?.slice(0, 16) ?? ""}
                        onChange={(e) =>
                          setValue(
                            "endsAt",
                            e.target.value ? new Date(`${e.target.value}Z`).toISOString() : "",
                          )
                        }
                      />
                    </Field>
                  </div>
                  <div className="info-banner">
                    <CalendarDays size={20} />
                    <p>
                      Set venues and their availability in Scheduling. After generation, build a
                      schedule checked for dependencies, overlaps and rest periods. Date entries
                      here are UTC.
                    </p>
                  </div>
                </>
              )}
              {step === 6 && (
                <>
                  <Field label="Tournament visibility">
                    <Select {...register("visibility")}>
                      <option value="private">Private — workspace members</option>
                      <option value="public">
                        Public — anyone with the link, after generation
                      </option>
                    </Select>
                  </Field>
                  <Field
                    label="Registration method"
                    hint="Public registration and approvals are planned. Manual registration is available."
                  >
                    <Select value="manual" {...register("registration")}>
                      <option value="manual">Manual — organizer adds entrants</option>
                      <option value="public-approval" disabled>
                        Public with approval — planned
                      </option>
                      <option value="public-open" disabled>
                        Public registration — planned
                      </option>
                    </Select>
                  </Field>
                  <div className="info-banner">
                    <ShieldCheck size={20} />
                    <p>
                      Public tournament pages show competition information and published rules.
                      Participant contact details and disciplinary evidence stay private.
                    </p>
                  </div>
                </>
              )}
              {step === 7 && (
                <>
                  <div className="review-banner">
                    <span className="review-icon">
                      <Trophy size={27} />
                    </span>
                    <div>
                      <h4>{values.name || "Untitled tournament"}</h4>
                      <p>
                        {sport?.name} · {values.online ? "Online" : "In person"}
                      </p>
                    </div>
                    <Badge tone="blue">Ready for review</Badge>
                  </div>
                  <dl className="review-grid">
                    <div>
                      <dt>Participants</dt>
                      <dd>
                        {values.entrantNames?.length}{" "}
                        {values.participantType === "individual" ? "individuals" : "teams"}
                      </dd>
                    </div>
                    <div>
                      <dt>Format</dt>
                      <dd>{chosen.name}</dd>
                    </div>
                    <div>
                      <dt>Matches</dt>
                      <dd>{preview?.matches.filter((m) => m.status !== "bye").length ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Match time</dt>
                      <dd>
                        {values.durationMinutes} min + {values.restMinutes} min rest
                      </dd>
                    </div>
                    <div>
                      <dt>Visibility</dt>
                      <dd>{values.visibility}</dd>
                    </div>
                    <div>
                      <dt>Roster restrictions</dt>
                      <dd>
                        {values.roster?.minimum || values.roster?.maximum
                          ? `${values.roster.minimum ?? "No min"} – ${values.roster.maximum ?? "No max"}`
                          : "Unrestricted"}
                      </dd>
                    </div>
                  </dl>
                  <div className="info-banner">
                    <Info size={20} />
                    <p>
                      Generation locks this configuration and creates real fixtures. Publish a
                      rulebook and assign venue availability separately. A schedule is created only
                      after its constraints pass.
                    </p>
                  </div>
                  <div className="preview-fixtures">
                    {preview?.matches
                      .filter((m) => m.round === 1)
                      .slice(0, 4)
                      .map((m) => (
                        <div key={m.id}>
                          <span>{values.entrantNames?.[Number(m.participants[0])] ?? "Bye"}</span>
                          <small>vs</small>
                          <span>{values.entrantNames?.[Number(m.participants[1])] ?? "Bye"}</span>
                        </div>
                      ))}
                  </div>
                  {Object.keys(errors).length > 0 && (
                    <p className="error-banner" role="alert">
                      Review the form errors before generating.
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="wizard-footer">
              <Button variant="ghost" onClick={() => (step ? setStep(step - 1) : onClose())}>
                <ArrowLeft size={16} />
                {step ? "Back" : "Cancel"}
              </Button>
              <div>
                <Button variant="outline" onClick={() => save(false)} loading={busy}>
                  <Save size={16} />
                  Save draft
                </Button>
                {step < 7 ? (
                  <Button
                    onClick={async () => {
                      if (step === 0 && !(await trigger(["name", "sportId"]))) return;
                      if (step === 1 && !(await trigger(["entrantNames", "roster"]))) return;
                      setStep(step + 1);
                    }}
                  >
                    Continue
                    <ArrowRight size={16} />
                  </Button>
                ) : (
                  <Button onClick={() => save(true)} loading={busy}>
                    <Sparkles size={16} />
                    Generate tournament
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Dialog>
      {randomTeams && (
        <RandomTeamGenerator
          organizationId={org.id}
          send={send}
          onClose={() => setRandomTeams(false)}
          onSaved={async (names) => {
            setValue("entrantNames", names, { shouldValidate: true });
            if (values.participantType === "individual") setValue("participantType", "team");
          }}
        />
      )}
      {infoFormat && (
        <Dialog
          open
          onOpenChange={() => setInfo(null)}
          title={infoFormat.name}
          description={infoFormat.description}
        >
          <div className="dialog-body format-info">
            <h4>With 8 participants</h4>
            <p>{infoFormat.example}</p>
            <div className="mini-fixture-visual">
              <span>Quarterfinals</span>
              <ArrowRight size={16} />
              <span>Semifinals</span>
              <ArrowRight size={16} />
              <span>Final / ranking</span>
            </div>
            <dl>
              <dt>Advantages</dt>
              <dd>{infoFormat.advantages}</dd>
              <dt>Tradeoffs</dt>
              <dd>{infoFormat.disadvantages}</dd>
              <dt>Matches / rounds</dt>
              <dd>
                {infoFormat.matches} / {infoFormat.rounds}
              </dd>
              <dt>Advancement</dt>
              <dd>{infoFormat.advancement}</dd>
              <dt>Tie handling</dt>
              <dd>{infoFormat.ties}</dd>
            </dl>
          </div>
        </Dialog>
      )}
    </>
  );
}
