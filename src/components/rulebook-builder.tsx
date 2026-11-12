"use client";
import { useState } from "react";
import { Plus, Trash2, ShieldCheck, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { type Command } from "@/lib/contracts";
import { penaltyKinds, ruleSchema, publishRulebookSchema } from "@/modules/rulebooks/rules";
import type { TournamentDetail, Workspace } from "@/lib/queries";
import { Button, Dialog, Field, Input, Select, Textarea, Badge } from "./ui/primitives";
import { title } from "@/lib/utils";
type Rule = z.infer<typeof ruleSchema>;
const newRule = (index: number): Rule => ({
  key: `R-${String(index).padStart(3, "0")}`,
  title: "",
  description: "",
  category: "Fair play",
  entity: "any-participant",
  severity: "medium",
  conditions: "",
  penalty: "warning",
  evidence: "",
  escalation: [],
  appealEligible: true,
});
export function RulebookBuilder({
  tournament,
  detail,
  send,
  onClose,
}: {
  tournament: Workspace["tournaments"][number];
  detail: TournamentDetail;
  send: (c: Command) => Promise<Record<string, unknown>>;
  onClose: () => void;
}) {
  const latest = detail.versions[0];
  const prior = detail.rules
    .filter((r) => r.versionId === latest?.id)
    .map(({ id: _id, versionId: _v, ...r }) => r as Rule);
  const [rules, setRules] = useState<Rule[]>(prior.length ? prior : [newRule(1)]),
    [effective, setEffective] = useState(""),
    [renewal, setRenewal] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function update(index: number, value: Partial<Rule>) {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...value } : r)));
  }
  async function publish() {
    setBusy(true);
    setError("");
    try {
      const publication = publishRulebookSchema.parse({
        title: detail.book?.title ?? `${tournament.name} rulebook`,
        effectiveAt: effective ? new Date(`${effective}Z`).toISOString() : new Date().toISOString(),
        requireRenewal: renewal,
        rules,
      });
      await send({
        action: "rulebook.publish",
        organizationId: tournament.organizationId,
        tournamentId: tournament.id,
        expectedRevision: tournament.revision,
        publication,
      });
      toast.success(`Rulebook version ${(latest?.version ?? 0) + 1} published.`);
      onClose();
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ")
          : e instanceof Error
            ? e.message
            : "Unable to publish.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title="Rulebook builder"
      description={`Publishing creates immutable version ${(latest?.version ?? 0) + 1}. Previous rules and acknowledgements are preserved.`}
      wide
    >
      <div className="rulebook-builder">
        <div className="info-banner">
          <ShieldCheck size={22} />
          <p>
            Set conduct and eligibility policies independently of tournament scoring. A published
            rule can only be changed by publishing a new version.
          </p>
        </div>
        {rules.map((rule, i) => (
          <section className="rule-editor" key={i}>
            <div className="rule-editor-heading">
              <Badge tone="blue">RULE {i + 1}</Badge>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove rule ${i + 1}`}
                disabled={rules.length === 1}
                onClick={() => setRules(rules.filter((_, j) => i !== j))}
              >
                <Trash2 size={16} />
              </Button>
            </div>
            <div className="form-grid">
              <Field label="Rule ID">
                <Input value={rule.key} onChange={(e) => update(i, { key: e.target.value })} />
              </Field>
              <Field label="Rule title">
                <Input
                  value={rule.title}
                  placeholder="e.g. Respectful conduct"
                  onChange={(e) => update(i, { title: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Detailed description">
              <Textarea
                value={rule.description}
                rows={3}
                onChange={(e) => update(i, { description: e.target.value })}
              />
            </Field>
            <div className="form-grid three">
              <Field label="Category">
                <Input
                  value={rule.category}
                  onChange={(e) => update(i, { category: e.target.value })}
                />
              </Field>
              <Field label="Applies to">
                <Select
                  value={rule.entity}
                  onChange={(e) => update(i, { entity: e.target.value as Rule["entity"] })}
                >
                  {[
                    "player",
                    "team",
                    "coach",
                    "manager",
                    "spectator",
                    "official",
                    "any-participant",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {title(v)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Severity">
                <Select
                  value={rule.severity}
                  onChange={(e) => update(i, { severity: e.target.value as Rule["severity"] })}
                >
                  {["low", "medium", "high", "critical"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Violation conditions">
              <Textarea
                value={rule.conditions}
                rows={2}
                placeholder="What actions constitute a violation?"
                onChange={(e) => update(i, { conditions: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Penalty">
                <Select
                  value={rule.penalty}
                  onChange={(e) => update(i, { penalty: e.target.value as Rule["penalty"] })}
                >
                  {penaltyKinds.map((v) => (
                    <option key={v} value={v}>
                      {title(v)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Evidence requirements">
                <Input
                  value={rule.evidence}
                  placeholder="e.g. Referee report and timestamp"
                  onChange={(e) => update(i, { evidence: e.target.value })}
                />
              </Field>
            </div>
            <Field
              label="Repeat violations / escalation"
              hint="Optional, comma-separated penalty names. No escalation is implied by default."
            >
              <Input
                defaultValue={rule.escalation.join(", ")}
                placeholder="final-warning, team-disqualification"
                onBlur={(e) =>
                  update(i, {
                    escalation: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean) as Rule["escalation"],
                  })
                }
              />
            </Field>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={rule.appealEligible}
                onChange={(e) => update(i, { appealEligible: e.target.checked })}
              />
              Eligible for appeal
            </label>
          </section>
        ))}
        <Button variant="outline" onClick={() => setRules([...rules, newRule(rules.length + 1)])}>
          <Plus size={16} />
          Add custom rule
        </Button>
        <div className="rule-publication">
          <Field label="Effective date (UTC, blank = now)">
            <Input
              type="datetime-local"
              value={effective}
              onChange={(e) => setEffective(e.target.value)}
            />
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={renewal}
              onChange={(e) => setRenewal(e.target.checked)}
            />
            Require renewed acknowledgement
          </label>
        </div>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={publish} loading={busy}>
            <FileCheck2 size={17} />
            Publish version {(latest?.version ?? 0) + 1}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
