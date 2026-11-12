import { describe, expect, it } from "vitest";
import {
  generateSchedule,
  validateSchedule,
  type Schedulable,
  type Resource,
} from "@/modules/scheduling/engine";
const resources: Resource[] = [
  { id: "court", availability: [{ start: "2026-12-01T09:00:00Z", end: "2026-12-01T19:00:00Z" }] },
];
const matches: Schedulable[] = [
  { id: "m1", participants: ["a", "b"], dependencies: [], durationMinutes: 60 },
  { id: "m2", participants: ["a", "c"], dependencies: ["m1"], durationMinutes: 60 },
];
const options = { restMinutes: 15, maxConcurrent: 1 };
describe("scheduling", () => {
  it("generates dependency-aware fixtures with checked rest and availability", () => {
    const b = generateSchedule(matches, resources, options);
    expect(validateSchedule(matches, resources, b, options)).toEqual([]);
    expect(b[1].start).toBe("2026-12-01T10:15:00.000Z");
  });
  it("detects venue overlap, participant double booking, rest and concurrency", () => {
    const b = [
      {
        matchId: "m1",
        venueId: "court",
        start: "2026-12-01T09:00:00Z",
        end: "2026-12-01T10:00:00Z",
      },
      {
        matchId: "m2",
        venueId: "court",
        start: "2026-12-01T09:30:00Z",
        end: "2026-12-01T10:30:00Z",
      },
    ];
    const errors = validateSchedule(matches, resources, b, options).join(" ");
    expect(errors).toMatch(/double-booked/);
    expect(errors).toMatch(/participant/);
    expect(errors).toMatch(/dependency/);
    expect(errors).toMatch(/Concurrent/);
  });
  it("honors participant availability and half-open adjacent intervals", () => {
    const b = generateSchedule(matches, resources, {
      ...options,
      restMinutes: 0,
      participantAvailability: {
        a: [{ start: "2026-12-01T12:00:00Z", end: "2026-12-01T17:00:00Z" }],
      },
    });
    expect(b[0].start).toBe("2026-12-01T12:00:00.000Z");
    expect(b[1].start).toBe(b[0].end);
  });
  it("rejects impossible windows, cyclic dependencies and invalid intervals", () => {
    expect(() =>
      generateSchedule(
        matches,
        [
          {
            ...resources[0],
            availability: [{ start: "2026-12-01T09:00:00Z", end: "2026-12-01T09:30:00Z" }],
          },
        ],
        options,
      ),
    ).toThrow(/No valid/);
    expect(() =>
      generateSchedule([{ ...matches[0], dependencies: ["m2"] }, matches[1]], resources, options),
    ).toThrow(/Cyclic/);
    expect(() =>
      generateSchedule(
        matches,
        [{ id: "x", availability: [{ start: "bad", end: "bad" }] }],
        options,
      ),
    ).toThrow(/Invalid/);
  });
});
