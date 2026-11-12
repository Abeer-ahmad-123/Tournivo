"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Jsonify, getPublicTournament } from "@/lib/queries";

export type PublicTournamentData = NonNullable<
  Jsonify<Awaited<ReturnType<typeof getPublicTournament>>>
>;

export function usePublicTournament(initial: PublicTournamentData) {
  const [data, setData] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const pending = useRef<AbortController | null>(null);
  const revoked = useRef(false);

  const refresh = useCallback(async () => {
    if (pending.current || revoked.current || document.visibilityState === "hidden") return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 10000);
    setRefreshing(true);
    try {
      const response = await fetch(
        `/api/public/tournaments/${encodeURIComponent(initial.tournament.slug)}`,
        {
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      if (response.status === 404) {
        revoked.current = true;
        setUnavailable(true);
        return;
      }
      if (!response.ok) throw new Error("Unable to update tournament progress.");
      const next: PublicTournamentData = await response.json();
      if (controller.signal.aborted) return;
      setData(next);
      setUpdatedAt(new Date());
      setError("");
    } catch {
      if (!controller.signal.aborted || controller.signal.reason === "timeout")
        setError("Couldn’t update. Showing the last received results. Try refreshing again.");
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted || controller.signal.reason === "timeout")
        setRefreshing(false);
    }
  }, [initial.tournament.slug]);

  useEffect(() => {
    const update = () => void refresh();
    const interval = setInterval(update, 15000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      pending.current?.abort("unmount");
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);

  return { data, refreshing, error, unavailable, updatedAt, refresh };
}
