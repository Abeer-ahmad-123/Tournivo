export type Window = { start: string; end: string };
export type Resource = { id: string; availability: Window[] };
export type Schedulable = {
  id: string;
  participants: string[];
  dependencies: string[];
  durationMinutes: number;
};
export type Booking = { matchId: string; venueId: string; start: string; end: string };
export type ScheduleOptions = {
  restMinutes: number;
  maxConcurrent: number;
  participantAvailability?: Record<string, Window[]>;
};
const minute = 60000;
const instant = (value: string) => Date.parse(value);
const overlap = (a: Window, b: Window) =>
  instant(a.start) < instant(b.end) && instant(b.start) < instant(a.end);
const validWindow = (w: Window) =>
  Number.isFinite(instant(w.start)) &&
  Number.isFinite(instant(w.end)) &&
  instant(w.start) < instant(w.end);
const contains = (outer: Window, inner: Window) =>
  instant(outer.start) <= instant(inner.start) && instant(outer.end) >= instant(inner.end);

export function validateSchedule(
  matches: Schedulable[],
  resources: Resource[],
  bookings: Booking[],
  options: ScheduleOptions,
  requireAll = true,
): string[] {
  const errors: string[] = [];
  if (
    !Number.isFinite(options.restMinutes) ||
    options.restMinutes < 0 ||
    !Number.isInteger(options.maxConcurrent) ||
    options.maxConcurrent < 1
  )
    return ["Invalid rest or concurrency settings."];
  if (new Set(matches.map((m) => m.id)).size !== matches.length)
    errors.push("Duplicate match identity.");
  if (new Set(resources.map((r) => r.id)).size !== resources.length)
    errors.push("Duplicate venue identity.");
  if (resources.some((r) => r.availability.some((w) => !validWindow(w))))
    errors.push("Invalid venue availability interval.");
  if (
    Object.values(options.participantAvailability ?? {}).some((windows) =>
      windows.some((w) => !validWindow(w)),
    )
  )
    errors.push("Invalid participant availability interval.");
  if (matches.some((m) => !Number.isFinite(m.durationMinutes) || m.durationMinutes <= 0))
    errors.push("Invalid match duration.");
  const byMatch = new Map(bookings.map((b) => [b.matchId, b]));
  if (byMatch.size !== bookings.length) errors.push("A match is booked more than once.");
  if (requireAll && matches.some((m) => !byMatch.has(m.id)))
    errors.push("Some matches have no schedule.");
  for (const booking of bookings) {
    const match = matches.find((m) => m.id === booking.matchId),
      venue = resources.find((v) => v.id === booking.venueId);
    if (!match || !venue) {
      errors.push(`${booking.matchId}: unknown match or venue.`);
      continue;
    }
    if (!validWindow(booking)) {
      errors.push(`${match.id}: invalid interval.`);
      continue;
    }
    if (instant(booking.end) - instant(booking.start) !== match.durationMinutes * minute)
      errors.push(`${match.id}: duration does not match configuration.`);
    if (!venue.availability.some((w) => contains(w, booking)))
      errors.push(`${match.id}: outside venue availability.`);
    for (const id of match.participants) {
      const windows = options.participantAvailability?.[id];
      if (windows && !windows.some((w) => contains(w, booking)))
        errors.push(`${match.id}: participant ${id} unavailable.`);
    }
    for (const id of match.dependencies) {
      const dependency = byMatch.get(id);
      if (!matches.some((m) => m.id === id)) errors.push(`${match.id}: unknown dependency.`);
      else if (
        !dependency ||
        instant(dependency.end) + options.restMinutes * minute > instant(booking.start)
      )
        errors.push(`${match.id}: dependency or rest conflict.`);
    }
  }
  for (let i = 0; i < bookings.length; i++)
    for (let j = i + 1; j < bookings.length; j++) {
      const a = bookings[i],
        b = bookings[j];
      const ma = matches.find((m) => m.id === a.matchId),
        mb = matches.find((m) => m.id === b.matchId);
      if (a.venueId === b.venueId && overlap(a, b))
        errors.push(`${a.matchId}/${b.matchId}: venue double-booked.`);
      if (ma && mb && ma.participants.some((p) => mb.participants.includes(p))) {
        const rest = options.restMinutes * minute;
        if (instant(a.start) < instant(b.end) + rest && instant(b.start) < instant(a.end) + rest)
          errors.push(`${a.matchId}/${b.matchId}: participant overlap or insufficient rest.`);
      }
    }
  // Sweep ends before starts so back-to-back matches do not count as overlapping.
  const events = bookings
    .flatMap((b) => [
      { t: instant(b.start), n: 1 },
      { t: instant(b.end), n: -1 },
    ])
    .sort((a, b) => a.t - b.t || a.n - b.n);
  let count = 0;
  for (const event of events) {
    count += event.n;
    if (count > options.maxConcurrent) {
      errors.push("Concurrent match limit exceeded.");
      break;
    }
  }
  return [...new Set(errors)];
}

export function generateSchedule(
  matches: Schedulable[],
  resources: Resource[],
  options: ScheduleOptions,
): Booking[] {
  const preliminary = validateSchedule(matches, resources, [], options, false);
  if (preliminary.length) throw new Error(preliminary.join(" "));
  const remaining = [...matches],
    bookings: Booking[] = [];
  if (!resources.length) throw new Error("At least one venue is required.");
  while (remaining.length) {
    const i = remaining.findIndex((m) =>
      m.dependencies.every((id) => bookings.some((b) => b.matchId === id)),
    );
    if (i < 0) throw new Error("Cyclic or missing match dependencies.");
    const match = remaining.splice(i, 1)[0];
    let best: Booking | undefined;
    for (const resource of resources)
      for (const window of resource.availability) {
        const afterDeps = Math.max(
          instant(window.start),
          ...match.dependencies.map(
            (id) =>
              instant(bookings.find((b) => b.matchId === id)!.end) + options.restMinutes * minute,
          ),
        );
        const candidateTimes = new Set<number>([
          afterDeps,
          ...bookings.map((b) => instant(b.end)),
          ...bookings.map((b) => instant(b.end) + options.restMinutes * minute),
          ...Object.values(options.participantAvailability ?? {}).flatMap((ws) =>
            ws.map((w) => instant(w.start)),
          ),
        ]);
        for (const start of [...candidateTimes]
          .filter((t) => t >= afterDeps)
          .sort((a, b) => a - b)) {
          const end = start + match.durationMinutes * minute;
          if (end > instant(window.end)) continue;
          const booking: Booking = {
            matchId: match.id,
            venueId: resource.id,
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
          };
          if (
            !validateSchedule(matches, resources, [...bookings, booking], options, false).length &&
            (!best || start < instant(best.start))
          )
            best = booking;
        }
      }
    if (!best)
      throw new Error(`No valid availability for ${match.id}. Extend windows or add resources.`);
    bookings.push(best);
  }
  const errors = validateSchedule(matches, resources, bookings, options);
  if (errors.length) throw new Error(errors.join(" "));
  return bookings;
}
