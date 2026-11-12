"use client";
import { useRef, useState } from "react";
import { ArrowUpRight, Copy, Globe2, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Workspace } from "@/lib/queries";
import type { Command } from "@/lib/contracts";
import { Button, Dialog, Field, Input } from "./ui/primitives";

export function ShareTournament({
  tournament,
  send,
  disabled,
}: {
  tournament: Workspace["tournaments"][number];
  send: (command: Command) => Promise<Record<string, unknown>>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const isPublic = tournament.visibility === "public";
  const local = url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);

  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => {
          setUrl(new URL(`/t/${tournament.slug}`, window.location.origin).href);
          setError("");
          setOpen(true);
        }}
      >
        <Share2 size={16} />
        Share tournament
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => !busy && setOpen(value)}
        title="Share tournament"
        description="Anyone with the public link can follow fixtures, scores, brackets and standings without logging in. Progress updates automatically every 15 seconds."
      >
        <div className="dialog-body share-tournament-body">
          {isPublic ? (
            <>
              <Field label="Public tournament link" hint="No account or login required.">
                <Input
                  ref={linkInput}
                  value={url}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
              </Field>
              <div className="share-link-actions">
                <Button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success("Tournament link copied.");
                      setError("");
                    } catch {
                      linkInput.current?.focus();
                      linkInput.current?.select();
                      setError("Copy the selected link from the field above.");
                    }
                  }}
                >
                  <Copy size={16} />
                  Copy link
                </Button>
                <a className="button button-outline" href={url} target="_blank" rel="noreferrer">
                  View public page
                  <ArrowUpRight size={16} />
                </a>
              </div>
              <p className="field-hint">
                To stop sharing, close this dialog and choose Make private.
              </p>
              {local && (
                <p className="info-banner">
                  This is a local app address. To share with people on other devices, use a publicly
                  hosted version of Tournivo.
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                This tournament is private. Enable its public link to let spectators follow the
                competition. Account details and disciplinary cases stay private.
              </p>
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await send({
                      action: "tournament.publish",
                      organizationId: tournament.organizationId,
                      tournamentId: tournament.id,
                      expectedRevision: tournament.revision,
                      visibility: "public",
                    });
                    toast.success("Public tournament link enabled.");
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "Unable to enable the public link.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Globe2 size={16} />
                Enable public link
              </Button>
            </>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
