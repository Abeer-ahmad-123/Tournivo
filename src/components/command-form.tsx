"use client";
import { useState } from "react";
export function CommandForm({
  children,
  onSubmit,
}: {
  children: React.ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="command-form"
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget,
          data = new FormData(form);
        setBusy(true);
        setError("");
        try {
          await onSubmit(data);
          form.reset();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to complete request.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <p className="field-hint" role="status">
            Saving changes…
          </p>
        )}
      </fieldset>
    </form>
  );
}
