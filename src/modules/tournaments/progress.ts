import type { Structure } from "./types";

export function tournamentProgress(structure: Structure) {
  const competitive = structure.matches.filter(
    (match) =>
      match.status !== "bye" &&
      !(match.stage === "grand-final-reset" && match.status === "pending"),
  );
  const completed = competitive.filter((match) => match.status === "completed").length;
  const ready = competitive.filter((match) => match.status === "ready");
  return {
    completed,
    total: competitive.length,
    ready: ready.length,
    remaining: competitive.length - completed,
    percent: competitive.length
      ? completed === competitive.length
        ? 100
        : Math.min(99, Math.round((completed / competitive.length) * 100))
      : 0,
    currentRound: ready.length ? Math.min(...ready.map((match) => match.round)) : null,
  };
}
