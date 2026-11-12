import { describe, expect, it } from "vitest";
import { validateRosters, rosterPolicySchema } from "@/modules/participants/roster";
import {
  assertCaseTransition,
  assertSafeReversal,
  planEligibilityPenalty,
} from "@/modules/discipline/workflow";
import { applicableVersion, publishRulebookSchema } from "@/modules/rulebooks/rules";
import { hasPermission } from "@/lib/permissions";
describe("organizer-defined rosters", () => {
  it("permits unequal sizes and no implicit catalog restrictions", () => {
    expect(validateRosters([0, 3, 7, 11, 25], { equalSizes: false })).toEqual([]);
    expect(validateRosters([3, 3], { maximum: 3, activeLineup: 3, equalSizes: true })).toEqual([]);
  });
  it("validates only configured constraints and separates lineup from roster", () => {
    expect(
      validateRosters([7, 9], { minimum: 7, maximum: 12, activeLineup: 7, equalSizes: false }),
    ).toEqual([]);
    expect(validateRosters([6], { activeLineup: 7, equalSizes: false })).toHaveLength(1);
    expect(validateRosters([3, 4], { equalSizes: true })).toHaveLength(1);
    expect(rosterPolicySchema.safeParse({ minimum: 12, maximum: 7 }).success).toBe(false);
  });
});
describe("discipline", () => {
  it("requires investigation and an explicit progression policy", () => {
    expect(() => assertCaseTransition("submitted", "confirmed")).toThrow();
    expect(() => assertCaseTransition("decision_pending", "confirmed")).not.toThrow();
    expect(() => planEligibilityPenalty("team-disqualification", "none", true)).toThrow(/policy/);
    expect(
      planEligibilityPenalty("team-disqualification", "preserve-results-forfeit-future", true),
    ).toEqual({ eligibility: "disqualified", applyForfeits: true });
  });
  it("preserves completed history and permits disqualification after completion", () => {
    expect(planEligibilityPenalty("team-disqualification", "none", false).applyForfeits).toBe(
      false,
    );
  });
  it("rejects ambiguous adjustments and unsafe appeal reversals", () => {
    expect(() => planEligibilityPenalty("point-deduction", "none", true)).toThrow(/explicit/);
    expect(() => assertSafeReversal("a", "a", 1, 1)).toThrow(/independent/);
    expect(() => assertSafeReversal("a", "b", 1, 2)).toThrow(/changed/);
    expect(() => assertSafeReversal("a", "b", 2, 2)).not.toThrow();
  });
});
it("selects applicable rule versions by effective date, not latest publication", () => {
  const versions = [
    { version: 1, effectiveAt: new Date("2026-01-01Z") },
    { version: 2, effectiveAt: new Date("2027-01-01Z") },
  ];
  expect(applicableVersion(versions, new Date("2026-11-01Z"))?.version).toBe(1);
  expect(publishRulebookSchema.safeParse({ rules: [] }).success).toBe(false);
});
it("denies unknown roles and limits referee and spectator permissions", () => {
  expect(hasPermission("super_fake_admin", "manage")).toBe(false);
  expect(hasPermission("referee", "discipline")).toBe(false);
  expect(hasPermission("spectator", "results")).toBe(false);
  expect(hasPermission("owner", "members")).toBe(true);
});
