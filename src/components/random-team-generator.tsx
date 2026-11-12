"use client";
import { useState } from "react";
import { z } from "zod";
import { Shuffle, Save, Users } from "lucide-react";
import { toast } from "sonner";
import type { Command } from "@/lib/contracts";
import { initials } from "@/lib/utils";
import {
  maxRandomTeamPlayers,
  randomTeamAssignmentSchema,
  randomTeamSettingsSchema,
  randomTeamCount,
} from "@/modules/participants/random-teams";
import { Badge, Button, Card, Dialog, Field, Input, Select, Textarea } from "./ui/primitives";

type Assignment = z.infer<typeof randomTeamAssignmentSchema>;
export function RandomTeamGenerator({
  organizationId,
  send,
  onClose,
  onSaved,
}: {
  organizationId: string;
  send: (command: Command) => Promise<Record<string, unknown>>;
  onClose: () => void;
  onSaved: (teamNames: string[]) => Promise<void>;
}) {
  const [names, setNames] = useState("");
  const [splitMode, setSplitMode] = useState<"team-count" | "team-size">("team-count");
  const [splitValue, setSplitValue] = useState("2");
  const [preview, setPreview] = useState<Assignment | null>(null);
  const [saveKey, setSaveKey] = useState("");
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState("");
  const playerNames = names
    .split(/[\r\n,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
  const settings = randomTeamSettingsSchema.safeParse({
    playerNames,
    splitMode,
    splitValue: Number(splitValue),
  });
  const count = settings.success ? randomTeamCount(settings.data) : null;
  const repeatedNames =
    new Set(playerNames.map((name) => name.normalize("NFKC").toLowerCase())).size <
    playerNames.length;
  function invalidate() {
    setPreview(null);
    setError("");
    setSaveKey("");
  }
  async function generate() {
    if (!settings.success) {
      setError(settings.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy("preview");
    setError("");
    try {
      const result = await send({
        action: "teams.preview",
        organizationId,
        settings: settings.data,
      });
      setPreview(randomTeamAssignmentSchema.parse({ ...settings.data, teams: result.teams }));
      setSaveKey(crypto.randomUUID());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate teams.");
    } finally {
      setBusy(null);
    }
  }
  async function save() {
    if (!preview || !saveKey || busy) return;
    setBusy("save");
    setError("");
    try {
      await send({
        action: "teams.generate",
        organizationId,
        assignment: preview,
        idempotencyKey: saveKey,
      });
      await onSaved(preview.teams.map((team) => team.name));
      toast.success(
        `${preview.teams.length} teams created with ${preview.playerNames.length} players.`,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save teams.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Generate random teams"
      description="Enter your players, choose a split, and let Tournivo mix up the teams and their names."
      wide
    >
      <form
        className="random-teams-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void generate();
        }}
      >
        <fieldset disabled={!!busy}>
          <Field
            label="Player names"
            hint={`One name per line or separated by commas. Up to ${maxRandomTeamPlayers} players; 120 characters per name.`}
          >
            <Textarea
              value={names}
              rows={6}
              maxLength={maxRandomTeamPlayers * 122}
              placeholder={"Alex\nAbeer\nSam\nJordan"}
              onChange={(event) => {
                setNames(event.target.value);
                invalidate();
              }}
              required
            />
          </Field>
          <div className="form-grid">
            <Field label="Split players by">
              <Select
                value={splitMode}
                onChange={(event) => {
                  setSplitMode(event.target.value as typeof splitMode);
                  invalidate();
                }}
              >
                <option value="team-count">Number of teams</option>
                <option value="team-size">Maximum players per team</option>
              </Select>
            </Field>
            <Field
              label={splitMode === "team-count" ? "Number of teams" : "Maximum players per team"}
            >
              <Input
                type="number"
                min={1}
                max={maxRandomTeamPlayers}
                step={1}
                required
                value={splitValue}
                onChange={(event) => {
                  setSplitValue(event.target.value);
                  invalidate();
                }}
              />
            </Field>
          </div>
          <div className="random-team-summary" aria-live="polite">
            <span>
              <Users size={16} />
              {playerNames.length} players
              {count !== null ? ` → ${count} team${count === 1 ? "" : "s"}` : ""}
            </span>
            <p>All players are assigned once. Uneven totals are shared as evenly as possible.</p>
          </div>
          {repeatedNames && (
            <p className="field-hint">
              Repeated names are treated as different players. Check the list if a name was entered
              by mistake.
            </p>
          )}
          <Button
            type="submit"
            variant={preview ? "outline" : "default"}
            loading={busy === "preview"}
          >
            <Shuffle size={16} />
            {preview ? "Reshuffle teams" : "Generate preview"}
          </Button>
        </fieldset>
      </form>
      {preview && (
        <section className="random-teams-results" aria-label="Generated team preview">
          <div className="random-teams-heading">
            <div>
              <h3>Your random teams</h3>
              <p>These exact names and rosters will be saved. Reshuffle for another draw.</p>
            </div>
            <Badge tone="blue">Preview</Badge>
          </div>
          <div className="collection-grid">
            {preview.teams.map((team, index) => (
              <Card className="random-team-card" key={team.name}>
                <div>
                  <span className={`team-emblem emblem-${index % 4}`}>{initials(team.name)}</span>
                  <div>
                    <h4>{team.name}</h4>
                    <p>
                      {team.players.length} player{team.players.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <ul>
                  {team.players.map((player) => (
                    <li key={player.index}>{player.name}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      )}
      <div className="random-teams-footer">
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button variant="ghost" disabled={!!busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            loading={busy === "save"}
            disabled={!preview || !!busy}
          >
            <Save size={16} />
            Save teams & players
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
